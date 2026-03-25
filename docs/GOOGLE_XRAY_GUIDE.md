# Google X-Ray Search - Alternative Scraping Method

## Overview

Google X-Ray search is an alternative method to scrape LinkedIn employee information **without requiring LinkedIn authentication**. Instead of directly accessing LinkedIn, it searches Google for LinkedIn profiles associated with a company.

## How It Works

### Search Query Format

```
site:linkedin.com/in/ "Company Name"
```

This tells Google to:

- Only search within `linkedin.com/in/` (LinkedIn profile pages)
- Look for pages mentioning the company name

### Example Flow

1. **Search Google**: `site:linkedin.com/in/ "GitHub"`
2. **Get Results**: Google returns ~100 search results with LinkedIn profiles
3. **Parse Results**: Extract name, title, and profile URL from each result
4. **Return Data**: JSON with employee list (limited information)

## ⚠️ Important: Google CAPTCHA & Rate Limits

**Common Issue:** Google may show CAPTCHA after detecting automated access.

### Is Google Blocking You?

Run with debug mode and check the screenshot:

```bash
DEBUG=1 npm start -- --xray "GitHub" --limit 50
# Check: data/debug-google-xray-*.png
```

**Signs of CAPTCHA:**

- Screenshot shows "I'm not a robot" checkbox
- Message: "unusual traffic from your computer network"
- 0 results returned even for popular companies

### Solutions

**Immediate:**

1. **Wait 24 hours** - Google's block is temporary for most IPs
2. **Use different IP** - Switch to mobile hotspot or different network
3. **Use VPN/Proxy** - Set `PROXY_URL` in `.env`
4. **Use direct LinkedIn scraping** - `--company <url>` instead

**Long-term:**

1. **Add delays between searches** - Wait 30-60 seconds between runs
2. **Limit daily searches** - Stay under 50-100 searches per day
3. **Use SerpApi** - Paid service that handles CAPTCHAs automatically
4. **Residential proxies** - Rotate IPs for higher volume

### SerpApi Alternative (Recommended for Production)

If Google blocks you frequently, use SerpApi:

```bash
npm install serpapi
```

```javascript
import { getJson } from "serpapi";

const results = await getJson({
  engine: "google",
  q: 'site:linkedin.com/in/ "GitHub"',
  api_key: process.env.SERPAPI_KEY,
  num: 100,
});
```

Cost: ~$50/month for 5,000 searches. No CAPTCHAs, better reliability.

---

## How It Works (Technical Details)

## Trade-offs

### ✅ Advantages

| Feature                  | Benefit                                                     |
| ------------------------ | ----------------------------------------------------------- |
| **No LinkedIn Auth**     | No need for `li_at` cookie or login                         |
| **Faster**               | No browser login, no pagination delays                      |
| **Lower Detection Risk** | Not accessing LinkedIn directly                             |
| **Higher Volume**        | Can scale more easily (Google rate limits are more lenient) |
| **No Account Risk**      | Your LinkedIn account won't be flagged/banned               |

### ❌ Limitations

| Limitation                | Impact                                                       |
| ------------------------- | ------------------------------------------------------------ |
| **Limited Data**          | Only get: name, title*, profile URL (*if visible in snippet) |
| **No Email Patterns**     | Can't infer email addresses without company domain           |
| **No Seniority**          | No detailed title analysis                                   |
| **No Experience Details** | No company history, education, skills                        |
| **Result Cap**            | Google typically returns ~100 results max per search         |
| **Google Rate Limits**    | Too many searches = CAPTCHA or temporary block               |
| **Accuracy**              | Some results may be outdated or incorrectly associated       |

## Usage

### CLI Mode

```bash
# Basic search
npm start -- --xray "GitHub" --limit 50

# With output path and CSV export
npm start -- --xray "Rebel Foods" --limit 100 --output ./data/rebel-xray --csv

# Debug mode
DEBUG=1 npm start -- --xray "OpenAI"
```

### API Mode

```bash
# Start server
npm run server

# Make request
curl -X POST http://localhost:3000/api/scrape/xray \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "GitHub",
    "limit": 50
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "employees": [
      {
        "name": "Jane Doe",
        "title": "Senior Software Engineer",
        "profileUrl": "https://linkedin.com/in/jane-doe",
        "snippet": "Senior Software Engineer at GitHub..."
      }
    ],
    "meta": {
      "source": "google-xray-search",
      "searchQuery": "site:linkedin.com/in/ \"GitHub\"",
      "companyName": "GitHub",
      "totalFound": 87,
      "returned": 50,
      "scrapedAt": "2026-03-25T10:30:00.000Z"
    }
  }
}
```

## When to Use Each Method

### Use Google X-Ray When:

- ✅ You don't have a LinkedIn account or cookie
- ✅ You need quick, basic employee lists
- ✅ You're scraping 100+ companies (avoid LinkedIn account limits)
- ✅ You only need name + profile URL (titles optional)
- ✅ Your LinkedIn account is already flagged/limited
- ✅ Building a lead generation database (basic contact info)

### Use Direct LinkedIn Scraping When:

- ✅ You need detailed profile information
- ✅ You need email inference (requires job titles)
- ✅ You need seniority classification
- ✅ You want experience history, education, skills
- ✅ You need high accuracy (100% company match)
- ✅ Scraping <100 profiles/day per account

## Performance Comparison

| Metric            | Google X-Ray       | Direct LinkedIn              |
| ----------------- | ------------------ | ---------------------------- |
| Speed per profile | ~0.5s              | ~12-15s                      |
| Authentication    | ❌ Not required    | ✅ Required (`li_at` cookie) |
| Data richness     | ⭐ Basic           | ⭐⭐⭐⭐⭐ Complete          |
| Daily limit       | ~500-1000 searches | ~100-150 profiles            |
| Setup complexity  | Low                | Medium                       |
| Account risk      | None               | Medium                       |

## Google Rate Limiting

### Limits

- **Per IP**: ~200-500 searches per day (residential IP)
- **CAPTCHA Trigger**: Excessive searches in short time
- **Temporary Block**: 24-hour cooldown if flagged

### Best Practices

1. **Add Delays**: Wait 3-5 seconds between searches
2. **Rotate IPs**: Use proxies for high volume (same as LinkedIn)
3. **Cache Results**: Store search results to avoid re-searching
4. **Human-like Patterns**: Vary search queries, don't batch identical queries

### Handling CAPTCHAs

If Google shows CAPTCHA:

```bash
# Option 1: Wait 24 hours
# Option 2: Switch to different IP/proxy
# Option 3: Use SerpApi (paid service that handles CAPTCHAs)
```

## Improving Accuracy

### Search Query Refinement

```javascript
// Basic search (most results, lower precision)
site:linkedin.com/in/ "GitHub"

// Include job titles (fewer results, higher precision)
site:linkedin.com/in/ "GitHub" "Engineer"

// Exclude false positives
site:linkedin.com/in/ "GitHub" -"recruiting" -"hiring"

// Location-specific
site:linkedin.com/in/ "GitHub" "San Francisco"
```

### Post-Processing Filters

The scraper already:

- Deduplicates by profile URL
- Filters out results that don't mention the company
- Extracts title from snippets when available

You can add custom filters:

```javascript
// Filter by title keywords
const engineers = employees.filter((emp) =>
  emp.title?.toLowerCase().includes("engineer"),
);

// Filter by snippet content
const current = employees.filter(
  (emp) =>
    emp.snippet?.includes("Current:") || emp.snippet?.includes("Present"),
);
```

## Alternative: SerpApi (Paid Service)

For production use with high reliability, consider [SerpApi](https://serpapi.com):

```bash
npm install serpapi
```

```javascript
import { getJson } from "serpapi";

const results = await getJson({
  engine: "google",
  q: 'site:linkedin.com/in/ "GitHub"',
  api_key: process.env.SERPAPI_KEY,
  num: 100,
});

const employees = results.organic_results.map((r) => ({
  name: extractName(r.title),
  title: extractTitle(r.snippet),
  profileUrl: r.link,
  snippet: r.snippet,
}));
```

**Benefits:**

- ✅ Handles CAPTCHAs automatically
- ✅ More reliable parsing
- ✅ Better rate limits
- ✅ Geographic targeting
- ❌ Cost: ~$50/month for 5,000 searches

## Output Format

### JSON Output

```json
{
  "employees": [
    {
      "name": "Bill Gates",
      "title": "Co-chair, Bill & Melinda Gates Foundation",
      "profileUrl": "https://linkedin.com/in/williamhgates",
      "snippet": "Co-chair, Bill & Melinda Gates Foundation..."
    }
  ],
  "meta": {
    "source": "google-xray-search",
    "searchQuery": "site:linkedin.com/in/ \"Bill Gates\"",
    "companyName": "Microsoft",
    "totalFound": 42,
    "returned": 42,
    "scrapedAt": "2026-03-25T10:30:00.000Z",
    "note": "Data extracted from Google search results - limited to publicly visible information"
  }
}
```

### CSV Output

```csv
name,title,profileUrl,snippet
Jane Doe,Senior Software Engineer,https://linkedin.com/in/jane-doe,"Senior Software Engineer at GitHub. Leading the..."
John Smith,Product Manager,https://linkedin.com/in/john-smith,"Product Manager at GitHub. Building developer tools..."
```

## Combining Both Methods

For best results, use a **hybrid approach**:

1. **Phase 1**: Use Google X-Ray to get list of employee profile URLs (fast, no auth)
2. **Phase 2**: Use direct LinkedIn scraping on selected profiles for detailed data

```bash
# Step 1: Get employee list via Google X-Ray
npm start -- --xray "GitHub" --limit 100 --csv

# Step 2: Extract profile URLs from CSV, feed to batch endpoint
curl -X POST http://localhost:3000/api/scrape/batch \
  -H "Content-Type: application/json" \
  -d '{
    "urls": ["url1", "url2", ...],
    "type": "profile"
  }'
```

This approach:

- ✅ Fast discovery (Google X-Ray)
- ✅ Detailed enrichment (LinkedIn direct) for selected profiles
- ✅ Minimizes LinkedIn account usage
- ✅ Best of both worlds

## Legal & Ethical Considerations

⚠️ **Important Notes:**

- Google X-Ray search is technically scraping Google's search results
- Google's Terms of Service prohibit automated access without permission
- Use responsibly and at reasonable rates
- Consider using official APIs (SerpApi) for production
- LinkedIn data is still subject to LinkedIn's Terms of Service
- Use only for legitimate business purposes (recruiting, research)

## Troubleshooting

### Issue: No results found

**Causes:**

- Company name is too generic or spelled incorrectly
- Google hasn't indexed many profiles for that company
- Search query needs refinement

**Solutions:**

```bash
# Try variations
npm start -- --xray "GitHub Inc"
npm start -- --xray "GitHub, Inc."

# Check directly on Google first
# Visit: https://www.google.com/search?q=site:linkedin.com/in/+%22GitHub%22
```

### Issue: CAPTCHA blocking requests

**Solutions:**

1. Add longer delays between requests
2. Use residential proxy
3. Switch to SerpApi
4. Wait 24 hours and try again

### Issue: Titles not being extracted

**Cause:** Google snippets don't always include job titles

**Solution:** This is expected - titles are "best effort" from X-Ray search. For accurate titles, use direct LinkedIn scraping.

## Summary

Google X-Ray search is a **fast, no-auth alternative** for getting basic employee lists. It's perfect for:

- Lead generation
- Recruitment sourcing
- Company research
- Building contact databases

But remember: **limited data quality**. For detailed profiles, combine with direct LinkedIn scraping.

---

**Related Documentation:**

- [README.md](../README.md) - Main documentation
- [API.md](../API.md) - API reference
- [technical-approach.md](technical-approach.md) - Technical details
- [COMPANY_SCRAPING_GUIDE.md](../COMPANY_SCRAPING_GUIDE.md) - Direct LinkedIn scraping guide
