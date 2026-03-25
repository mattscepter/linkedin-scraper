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

### Alternative: Google X-Ray Search (No Authentication)

**NEW: Auth-free approach via Google search**

An alternative scraping method using Google X-Ray search has been implemented for
scenarios where LinkedIn authentication is not available or desirable:

**Search Query Pattern:**
```
site:linkedin.com/in/ "Company Name"
```

This tells Google to return only LinkedIn profile pages that mention the company name.

**Advantages:**
- ✅ No LinkedIn cookie or authentication required
- ✅ Faster execution (~0.2s per result vs ~12-15s per profile)
- ✅ Lower detection risk (not accessing LinkedIn directly)
- ✅ Can scale to higher volumes without LinkedIn account limits
- ✅ No risk of LinkedIn account suspension

**Limitations:**
- ❌ Limited data: only name, title (if in snippet), and profile URL
- ❌ No email patterns, seniority classification, or detailed experience
- ❌ Google rate limits (~500-1000 searches per day per IP)
- ❌ Result cap (~100 profiles max per search query)
- ❌ Dependent on Google's indexing and snippet quality

**Implementation:**
Uses Playwright to search Google, parse search results, and extract LinkedIn profile
information from search snippets. Results are post-processed to deduplicate and
filter for company relevance.

**When to Use:**
- Quick employee list discovery (lead generation, recruitment sourcing)
- No LinkedIn account available
- Scraping many companies (100+) without hitting LinkedIn limits
- Building initial contact databases before detailed enrichment

See [GOOGLE_XRAY_GUIDE.md](./GOOGLE_XRAY_GUIDE.md) for complete documentation.

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

### 5.1 Application-Level Rate Limiting

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

### 5.2 IP-Based Rate Limiting & Proxy Strategy

**Current Implementation:**

The scraper includes built-in proxy support via environment variable:

```javascript
// src/scrapers/browser.js
const proxy = process.env.PROXY_URL
  ? { server: process.env.PROXY_URL }
  : undefined;
```

**When Proxies Are NOT Required:**

- ✅ Small-scale usage: 10-100 profiles/day
- ✅ Residential/home internet connection
- ✅ Single LinkedIn account
- ✅ Proper delays between requests (3-8s)

LinkedIn's IP rate limiting is relatively lenient for normal viewing patterns.
A residential IP with human-like delays can scrape 50-150 profiles/day without
triggering blocks.

**When Proxies ARE Required:**

1. **Datacenter/Cloud IPs** - LinkedIn aggressively blocks AWS, GCP, Azure, DigitalOcean
   IPs. If running on a VPS, residential proxies are mandatory.

2. **High Volume** - Beyond 100-150 profiles/day from a single IP, LinkedIn begins
   flagging the traffic as suspicious.

3. **Multiple Accounts** - Running 5+ accounts from the same IP creates a
   detectable fingerprint.

4. **Previous Blocks** - If an IP has been flagged before, even low-volume
   traffic may trigger immediate blocks.

**Proxy Types:**

| Type                  | Detection Risk | Cost/GB | Use Case                        |
| --------------------- | -------------- | ------- | ------------------------------- |
| Residential           | Very Low       | $10-15  | Production scraping             |
| ISP (Residential ASN) | Low            | $3-8    | Medium-scale (100-500/day)      |
| Datacenter            | Very High      | $1-3    | ❌ Not recommended for LinkedIn |

**Recommended Providers:**

- **Bright Data** (BrightData.com) - Most reliable, ~$10/GB
- **Oxylabs** (Oxylabs.io) - Enterprise-grade, ~$12/GB
- **Smartproxy** (Smartproxy.com) - Budget-friendly, ~$8/GB
- **NetNut** (Netnut.io) - Static residential IPs, ~$15/GB

**Proxy Configuration Example:**

```bash
# .env
LINKEDIN_COOKIE=your_li_at_cookie
PROXY_URL=http://username:password@proxy.provider.com:8080

# For SOCKS5 proxies:
# PROXY_URL=socks5://username:password@proxy.provider.com:1080
```

**Production Proxy Strategy (1000+ profiles/day):**

```javascript
// Pseudo-code for proxy rotation
const proxyPool = [
  "http://user:pass@proxy1.provider.com:8080",
  "http://user:pass@proxy2.provider.com:8080",
  "http://user:pass@proxy3.provider.com:8080",
];

// Assign 1 proxy per LinkedIn account for entire session (sticky session)
const accountProxyMap = {
  "account1@email.com": proxyPool[0],
  "account2@email.com": proxyPool[1],
  "account3@email.com": proxyPool[2],
};

// Each worker uses consistent proxy for 50-100 requests, then rotates
```

**IP Rotation Strategy:**

- **Sticky Sessions**: Use same proxy for entire scrape session (10-30 mins)
- **Session Rotation**: Rotate to new proxy every 50-100 profile views
- **Geographic Consistency**: Keep IP in same region as LinkedIn account registration
- **Connection Pooling**: Reuse TCP connections within session to avoid reconnect overhead

**Cost Analysis:**

| Scale           | Profiles/Day | Accounts | Proxies Needed | Monthly Cost |
| --------------- | ------------ | -------- | -------------- | ------------ |
| Small (current) | 50-100       | 1        | 0 (no proxy)   | $0           |
| Medium          | 500-1000     | 5-10     | 5-10           | $50-150      |
| Large           | 10,000+      | 100+     | 100+           | $1,000+      |
| Enterprise      | 100,000+     | API only | N/A            | $500-2,000   |

At enterprise scale (100K+ profiles/day), using Proxycurl API (~$0.01/profile)
becomes more cost-effective than managing proxy infrastructure.

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

---

## 7. Future Enhancements & TODO

### 7.1 Queue-Based Async Processing with BullMQ

**Motivation:** Current implementation is synchronous — API requests block until
scraping completes (12-60s per profile). For bulk operations (100s-1000s of URLs),
this becomes a bottleneck.

**Proposed Architecture:**

```
┌─────────────┐      ┌──────────────┐      ┌─────────────────┐
│   Client    │─────▶│  REST API    │─────▶│  BullMQ Queue   │
│             │      │   (Express)  │      │   (Redis)       │
└─────────────┘      └──────────────┘      └─────────────────┘
                            │                       │
                            │                       ▼
                            │              ┌─────────────────┐
                            │              │  Worker Pool    │
                            │              │  (Scraper Jobs) │
                            │              └─────────────────┘
                            │                       │
                            ▼                       ▼
                     ┌──────────────────────────────────┐
                     │      Webhook Callback            │
                     │  POST {url, status, data}        │
                     └──────────────────────────────────┘
```

**Implementation Steps:**

1. **Install BullMQ:**

   ```bash
   npm install bullmq ioredis
   ```

2. **Create Queue Producer** (`src/queue/producer.js`):

   ```javascript
   import { Queue } from "bullmq";

   const scrapeQueue = new Queue("linkedin-scrape", {
     connection: { host: "localhost", port: 6379 },
   });

   export async function enqueueJob(type, url, options = {}) {
     return scrapeQueue.add(
       `scrape-${type}`,
       {
         type, // 'profile' | 'company'
         url,
         options, // { limit, domain, webhookUrl }
         jobId: generateJobId(),
       },
       {
         attempts: 3,
         backoff: { type: "exponential", delay: 30000 },
       },
     );
   }
   ```

3. **Create Worker** (`src/queue/worker.js`):

   ```javascript
   import { Worker } from "bullmq";
   import { scrapeProfile } from "../scrapers/profileScraper.js";
   import { runCompanyScrape } from "../commands/scrapeCompany.js";

   const worker = new Worker(
     "linkedin-scrape",
     async (job) => {
       const { type, url, options } = job.data;

       try {
         const result =
           type === "profile"
             ? await scrapeProfile(url)
             : await runCompanyScrape(url, options);

         // Send webhook callback if provided
         if (options.webhookUrl) {
           await sendWebhook(options.webhookUrl, {
             jobId: job.data.jobId,
             status: "completed",
             data: result,
           });
         }

         return result;
       } catch (error) {
         if (options.webhookUrl) {
           await sendWebhook(options.webhookUrl, {
             jobId: job.data.jobId,
             status: "failed",
             error: error.message,
           });
         }
         throw error;
       }
     },
     {
       connection: { host: "localhost", port: 6379 },
       concurrency: 5, // 5 parallel browser contexts
       limiter: { max: 10, duration: 60000 }, // Rate limit: 10 jobs/min
     },
   );
   ```

4. **Add Queue Endpoints to API** (`src/server.js`):

   ```javascript
   // POST /api/scrape/async - Queue a scrape job
   app.post("/api/scrape/async", async (req, res) => {
     const { type, url, options } = req.body;
     const job = await enqueueJob(type, url, options);

     res.json({
       success: true,
       jobId: job.id,
       status: "queued",
       checkUrl: `/api/jobs/${job.id}`,
       message: "Job queued successfully",
     });
   });

   // GET /api/jobs/:jobId - Check job status
   app.get("/api/jobs/:jobId", async (req, res) => {
     const job = await scrapeQueue.getJob(req.params.jobId);
     const state = await job.getState();

     res.json({
       jobId: job.id,
       status: state,
       progress: job.progress,
       data: state === "completed" ? job.returnvalue : null,
       error: state === "failed" ? job.failedReason : null,
     });
   });

   // POST /api/scrape/bulk - Bulk enqueue with webhook
   app.post("/api/scrape/bulk", async (req, res) => {
     const { urls, type, webhookUrl, options } = req.body;

     const jobs = await Promise.all(
       urls.map((url) =>
         enqueueJob(type, url, {
           ...options,
           webhookUrl,
         }),
       ),
     );

     res.json({
       success: true,
       totalQueued: jobs.length,
       jobIds: jobs.map((j) => j.id),
       webhookUrl,
     });
   });
   ```

### 7.2 Webhook Integration for Async Notifications

**Purpose:** Instead of polling `/api/jobs/:jobId`, clients can provide a webhook
URL that receives automatic callbacks when scraping completes.

**Implementation:**

```javascript
// src/utils/webhook.js
import axios from "axios";

export async function sendWebhook(webhookUrl, payload) {
  try {
    await axios.post(
      webhookUrl,
      {
        timestamp: new Date().toISOString(),
        ...payload,
      },
      {
        timeout: 10000,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error(`[webhook] Failed to send to ${webhookUrl}:`, error.message);
    // Store failed webhooks in dead letter queue for retry
  }
}
```

**Webhook Payload Schema:**

```json
{
  "timestamp": "2026-03-25T10:30:00.000Z",
  "jobId": "job_abc123",
  "status": "completed",
  "type": "profile",
  "url": "https://linkedin.com/in/example",
  "data": {
    "name": "Jane Doe",
    "headline": "Software Engineer @ GitHub",
    ...
  },
  "error": null,
  "duration": 12500
}
```

### 7.3 Additional Improvements

**Cookie Pool Management:**

- Database table tracking cookies: `{ cookie, accountEmail, createdAt, lastUsed, dailyQuota }`
- Health check endpoint: validate cookies daily, rotate expired ones
- Round-robin assignment: each job gets least-recently-used cookie

**Distributed Worker Deployment:**

- Docker containers for workers
- Kubernetes HorizontalPodAutoscaler based on queue depth
- Each pod runs 5 browser contexts (1 CPU core each)

**Monitoring & Observability:**

- BullMQ UI dashboard (`npm install @bull-board/express`)
- Prometheus metrics: job success rate, queue depth, scrape duration
- Sentry error tracking for failed jobs

**Data Persistence:**

- Store scraped results in PostgreSQL/MongoDB
- Enable `/api/cache/profile/:username` endpoint for instant retrieval

---
