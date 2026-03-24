# LinkedIn Company & Profile Data Scraper

A Node.js tool that extracts employee and profile data from LinkedIn, outputting clean JSON (and optionally CSV). Available as both **CLI** and **REST API**.

## Stack

- **Runtime:** Node.js 18+
- **Browser automation:** Playwright + `playwright-extra` (stealth)
- **CLI parsing:** Commander.js
- **Auth:** LinkedIn session cookie injection (`li_at`)

---

## Installation

```bash
# 1. Clone and install dependencies
npm install

# 2. Install the Playwright browser binary
npx playwright install chromium

# 3. Set up your LinkedIn session cookie
cp .env.example .env
# Edit .env and set LINKEDIN_COOKIE=<your li_at value>
```

### Getting your `li_at` cookie

1. Open Chrome and log into [linkedin.com](https://www.linkedin.com)
2. Open DevTools → **Application** tab → **Cookies** → `https://www.linkedin.com`
3. Copy the **Value** of the `li_at` cookie
4. Paste it into `.env` as `LINKEDIN_COOKIE=<value>`

---

## Usage

### 🚀 Quick Start

#### Scrape company employees

```bash
npm start -- --company https://www.linkedin.com/company/github/ --limit 50
```

#### Scrape a profile

```bash
npm start -- --profile https://www.linkedin.com/in/example-user/
```

### All options

```
Options:
  -c, --company <url>   Scrape employees from a LinkedIn company URL
  -p, --profile <url>   Scrape data from a LinkedIn profile URL
  -o, --output <path>   Output file path (without extension)  [default: data/<slug>]
  -l, --limit <number>  Max employees to collect              [default: 100]
  -d, --domain <domain> Company domain for email pattern inference (e.g. github.com)
      --csv             Also export results as CSV
  -V, --version         Show version
  -h, --help            Show help
```

### 📖 Detailed Company Scraping Guide

For comprehensive documentation on company scraping, pagination, and best practices, see:

**[COMPANY_SCRAPING_GUIDE.md](./COMPANY_SCRAPING_GUIDE.md)** - Covers:

- Pagination & "Show more results" button handling
- Performance & rate limiting
- Output format examples
- Troubleshooting common issues
- Best practices

### Examples

```bash
# Scrape 50 employees with email patterns
npm start -- --company https://www.linkedin.com/company/stripe/ --limit 50 --domain stripe.com --csv

# Scrape 100 employees
npm start -- --company https://www.linkedin.com/company/github/ --limit 100

# Save profile output to a custom path
npm start -- --profile https://www.linkedin.com/in/jane-doe/ --output ./results/jane-doe

# Enable debug logging on error
DEBUG=1 npm start -- --company https://www.linkedin.com/company/github/
```

---

## 🌐 REST API Mode

You can also run this tool as a **REST API server** for HTTP-based scraping.

### Start the API Server

```bash
# Production mode
npm run server

# Development mode (auto-restart on file changes)
npm run dev
```

Server will start on `http://localhost:3000` (configurable via `PORT` environment variable).

### API Endpoints

#### 1. Health Check

```bash
curl http://localhost:3000/health
```

#### 2. Scrape Company Employees

```bash
curl -X POST http://localhost:3000/api/scrape/company \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/company/github/",
    "limit": 20,
    "domain": "github.com"
  }'
```

#### 3. Scrape Profile

```bash
curl -X POST http://localhost:3000/api/scrape/profile \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/in/williamhgates/"
  }'
```

#### 4. Batch Scraping

```bash
curl -X POST http://localhost:3000/api/scrape/batch \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://www.linkedin.com/in/williamhgates/",
      "https://www.linkedin.com/in/satyanadella/"
    ],
    "type": "profile"
  }'
```

### Test the API

Run the automated test suite:

```bash
./test-api.sh
```

### 📘 Full API Documentation

For complete API documentation including all endpoints, parameters, error handling, integration examples, and deployment guides, see:

**[API.md](./API.md)** - Comprehensive REST API reference

---

## Output

Results are written to the `data/` directory by default.

### Company output (`data/company-<slug>.json`)

```json
{
  "employees": [
    {
      "name": "Jane Doe",
      "title": "Senior Product Manager",
      "profileUrl": "https://www.linkedin.com/in/jane-doe",
      "seniority": "senior",
      "emailPattern": "jane.doe@company.com"
    }
  ],
  "meta": {
    "sourceUrl": "https://www.linkedin.com/company/example/",
    "scrapedAt": "2026-03-23T10:30:00.000Z",
    "totalCollected": 50
  }
}
```

### Profile output (`data/profile-<username>.json`)

```json
{
  "name": "Jane Doe",
  "headline": "Senior Product Manager @ Acme | Ex-Google",
  "location": "San Francisco, CA",
  "profileUrl": "https://www.linkedin.com/in/jane-doe",
  "connections": "500+",
  "about": "...",
  "experience": [
    {
      "title": "Senior PM",
      "company": "Acme",
      "startDate": "Jan 2023",
      "endDate": "Present",
      "duration": "1 yr 3 mos",
      "location": "SF"
    }
  ],
  "education": [
    {
      "school": "Stanford",
      "degree": "MS",
      "field": "Computer Science",
      "startDate": "2016",
      "endDate": "2018"
    }
  ],
  "skills": ["Product Strategy", "SQL", "Python"],
  "scrapedAt": "2026-03-16T10:35:00.000Z"
}
```

---

## Project Structure

```
linkedin-scraper/
├── src/
│   ├── index.js                  # CLI entrypoint (commander.js)
│   ├── server.js                 # REST API server (express.js) ✨ NEW
│   ├── commands/
│   │   ├── scrapeCompany.js      # Orchestrates company scrape + output
│   │   └── scrapeProfile.js      # Orchestrates profile scrape + output
│   ├── scrapers/
│   │   ├── browser.js            # Playwright launch, stealth, cookie injection
│   │   ├── companyScraper.js     # DOM parsing for /people/ pages
│   │   └── profileScraper.js     # JSON-LD + CSS selector for /in/ pages
│   ├── utils/
│   │   ├── delay.js              # Jittered random delay helper
│   │   ├── retry.js              # Exponential backoff wrapper
│   │   ├── cookies.js            # Cookie loading from .env
│   │   ├── normalize.js          # Text normalization, seniority inference, email pattern
│   │   └── validation.js         # LinkedIn URL validation ✨ NEW
│   └── output/
│       ├── jsonWriter.js         # JSON file writer
│       └── csvWriter.js          # CSV file writer (bonus)
├── config/
│   └── defaults.js               # Rate limits, timeouts, browser settings
├── docs/
│   └── technical-approach.md     # Methodology document
├── data/                         # Output files (gitignored)
│   ├── sample-company.json       # Sample company output
│   └── sample-profile.json       # Sample profile output
├── API.md                        # REST API documentation ✨ NEW
├── test-api.sh                   # API test script ✨ NEW
├── .env.example
├── .gitignore
└── package.json
```

---

## Sample Outputs

Pre-generated sample outputs are in `data/`:

- [`data/sample-company.json`](data/sample-company.json) — 10 anonymized employees
- [`data/sample-profile.json`](data/sample-profile.json) — Full profile example

---

## Technical Notes

See [`docs/technical-approach.md`](docs/technical-approach.md) for the full methodology covering authentication strategy, bot evasion, DOM parsing, rate limiting, and scalability considerations.

---

## Important Notice

This tool is built for educational and assignment purposes only. Scraping LinkedIn may
violate their [Terms of Service](https://www.linkedin.com/legal/user-agreement).
Use responsibly, with your own account, and at safe request rates.
