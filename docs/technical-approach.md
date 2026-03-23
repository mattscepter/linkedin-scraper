# Technical Approach: LinkedIn Company & Profile Data Scraper

## Overview

LinkedIn is one of the most aggressively protected platforms to scrape. It employs
multi-layered bot detection including TLS fingerprinting, browser automation
detection via `navigator.webdriver`, hCaptcha, behavioral velocity analysis,
and IP reputation scoring. This document explains the methodology chosen for each
challenge.

---

## 1. Authentication Strategy

**Chosen approach: Session cookie injection**

Rather than programmatic login (username + password), the tool uses the `li_at`
session token extracted from an already-authenticated browser session. This approach:

- Avoids triggering LinkedIn's login anomaly detection, which flags automated
  credential submissions even with valid credentials
- Uses cookies that are identical to a real browser session, making traffic
  indistinguishable at the HTTP layer
- Requires the user to provide the cookie once; it remains valid for days to weeks

The cookie is loaded from a `.env` file and injected into the Playwright browser
context via `context.addCookies()` before any navigation. Additional cookies
(`JSESSIONID`, `bcookie`, `lidc`) are injected too when provided, as LinkedIn
correlates these for session validation.

**Trade-off:** This approach is bounded to one account and cookie lifetime. For
production scale, cookie rotation across multiple accounts or a paid API
(e.g. Proxycurl) would replace this layer.

---

## 2. Bot Detection Evasion

**Tool: Playwright + playwright-extra + puppeteer-extra-plugin-stealth**

The stealth plugin applies ~20 evasion patches at browser launch:

- Removes `navigator.webdriver = true` flag (the most obvious bot signal)
- Spoofs `chrome.runtime`, `navigator.plugins`, media codecs, and `Proxy.toString`
- Randomizes canvas fingerprint entropy
- Patches iframe `contentWindow` and `permissions.query` to behave like real Chrome

Additionally:

- Browser runs in **headful mode** (not headless). LinkedIn's TLS JA3 fingerprint
  for headless Chromium is distinct from real Chrome; headful mode reduces this signal.
- User-agent is set to a current stable Chrome version string.
- A slow-motion offset (`slowMo: 50ms`) adds micro-delays between browser actions,
  mimicking human motor latency.
- Viewport, locale, timezone, and language headers are set to consistent
  real-user values.

---

## 3. Data Extraction Strategy

### Company Employees (`/company/<slug>/people/`)

**Strategy: DOM parsing with pagination**

LinkedIn's people directory is client-side rendered. Employee data is loaded
progressively via infinite scroll and "Show more results" buttons.

The tool navigates to `/company/<slug>/people/` and:

1. Scrolls to bottom to trigger content loading
2. Detects and clicks "Show more results" button
3. Repeats until limit reached or no more employees found
4. Parses employee cards from DOM using stable selectors:
   - `[data-view-name="profile-card"]`
   - `.org-people-profile-card__profile-info`
   - Various fallback selectors for different layouts

**Deduplication:** Profile URLs are tracked in a Set during extraction to prevent
duplicates (LinkedIn can render the same person multiple times in DOM).

**Robustness:** Uses multiple selector patterns to handle LinkedIn's layout variations.

### Profile Pages (`/in/<username>/`)

**Primary: JSON-LD parsing**

LinkedIn embeds a `<script type="application/ld+json">` block containing a
schema.org `Person` object in all public profile pages. This is intentionally
machine-readable and represents the most stable extraction surface. Fields
available: name, jobTitle, description, worksFor (experience), alumniOf (education).

**Fallback: CSS selectors**

For fields not in JSON-LD (skills, connections count, about section, granular
experience date ranges), the tool falls back to CSS selectors tuned for LinkedIn's
current DOM structure (as of 2026). Before extraction, the tool programmatically
clicks "Show more" and "Show all skills" buttons to expand truncated sections.

---

## 4. Pagination and Infinite Scroll

LinkedIn's employee list uses infinite scroll — there are no numbered pages.
The scroll loop works as follows:

1. Navigate to `/company/<slug>/people/`
2. Register XHR `response` listener
3. Loop: scroll to bottom of page → wait 1.5–3.5s (jittered) → new XHR fires
4. Accumulate employees from each XHR batch (10 per scroll)
5. Stop when: (a) two consecutive scrolls yield no new employees, (b) the
   configurable `maxEmployees` limit is reached, or (c) maximum scroll count
   is exceeded

---

## 5. Rate Limiting and Error Handling

**Jittered delays:** Every page navigation waits a random 3–8 seconds; every
scroll event waits a random 1.5–3.5 seconds. Humans exhibit natural rhythm
variance — uniform delays are a detectable bot signal.

**Per-account limits:** LinkedIn soft-blocks accounts that view more than
~100–150 profiles per day. The tool defaults to `maxEmployees: 100`.

**HTTP status handling:** The retry utility detects `429` (Too Many Requests)
and LinkedIn's `999` (anti-bot block) status codes and applies exponential
backoff: 30s × attempt number. Maximum 3 attempts per operation.

**Graceful null-filling:** Missing fields always serialize as `null` rather
than being omitted, ensuring a consistent JSON schema regardless of profile
completeness.

---

## 6. Scalability Considerations

At the assignment's scope (10 employees / 1 profile), a single account + cookie
is sufficient. To scale to 10,000 profiles/day:

| Requirement                     | Solution                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| ~100 profiles/account/day limit | Rotate 100+ LinkedIn accounts with individual cookies                                              |
| IP reputation                   | Residential proxies (Bright Data, Oxylabs); 1 sticky proxy per session                             |
| Throughput                      | Parallel browser contexts (one per account); queue with BullMQ/Redis                               |
| Cookie expiry                   | Health-check job that validates `li_at` daily and flags expired cookies                            |
| Production reliability          | Replace browser scraping with Proxycurl API (~$0.01/credit) which absorbs all the above complexity |

A queue-based architecture (job producer → Redis queue → N consumer workers,
each with their own browser context and account cookie) can sustain 10K+ daily
with ~10 worker nodes.
