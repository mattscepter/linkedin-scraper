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
