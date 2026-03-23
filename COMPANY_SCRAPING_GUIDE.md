# LinkedIn Company Employee Scraping Guide

## Overview

This tool scrapes employee data from LinkedIn company pages using DOM parsing. It collects:

- Name
- Current title/headline
- Profile URL
- Inferred seniority level
- Email pattern (if domain provided)

**Speed**: ~5-10 seconds for 100 employees (after pagination)  
**Use case**: Employee lists, lead generation, talent analysis

---

## Usage

### Basic Command

```bash
# Scrape 50 employees
npm start -- --company https://www.linkedin.com/company/rebel-foods/ --limit 50

# With email pattern inference
npm start -- --company https://www.linkedin.com/company/github/ --limit 100 --domain github.com

# Export to CSV as well
npm start -- --company https://www.linkedin.com/company/google/ --limit 50 --csv
```

---

## Command Line Options

| Option              | Description                        | Example                                              |
| ------------------- | ---------------------------------- | ---------------------------------------------------- |
| `--company <url>`   | LinkedIn company URL (required)    | `--company https://www.linkedin.com/company/github/` |
| `--limit <number>`  | Max employees to scrape            | `--limit 50`                                         |
| `--domain <domain>` | Company domain for email inference | `--domain github.com`                                |
| `--output <path>`   | Custom output path (no extension)  | `--output data/my-scrape`                            |
| `--csv`             | Also export as CSV                 | `--csv`                                              |

---

## Output Format

```json
{
  "employees": [
    {
      "name": "Jane Doe",
      "title": "Senior Product Manager",
      "profileUrl": "https://linkedin.com/in/jane-doe",
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

### Field Descriptions

- **name**: Full name as displayed on LinkedIn
- **title**: Current job title/headline
- **profileUrl**: Full LinkedIn profile URL
- **seniority**: Inferred level based on title (`junior`, `mid`, `senior`, `lead`, `staff`, `principal`, `manager`, `director`, `vp`, `c-level`)
- **emailPattern**: Guessed email format (only if `--domain` flag provided)

---

## How It Works

### 1. Session Warmup

The scraper first visits LinkedIn's feed page to establish a valid session with your `li_at` cookie.

### 2. Pagination

Navigates to `/company/<slug>/people/` and automatically:

- Scrolls to bottom to trigger content loading
- Detects and clicks "Show more results" button
- Repeats until limit reached or no more employees found

### 3. DOM Parsing

Extracts employee cards from the page's DOM structure using stable selectors.

### 4. Deduplication

Tracks profile URLs during extraction to prevent duplicates.

---

## Performance

| Employees | Pagination Time | Parse Time | Total Time |
| --------- | --------------- | ---------- | ---------- |
| 10        | ~5-10 sec       | <1 sec     | ~6-11 sec  |
| 50        | ~15-25 sec      | 1-2 sec    | ~16-27 sec |
| 100       | ~30-45 sec      | 2-3 sec    | ~32-48 sec |
| 200+      | ~1-2 min        | 3-5 sec    | ~1-2 min   |

---

## Best Practices

### ✅ Do

- **Start small**: Test with `--limit 10` first
- **Keep cookie fresh**: Update `li_at` cookie every few months
- **Use domain flag**: Adds valuable email pattern for lead gen
- **Export to CSV**: Use `--csv` for easy import to CRM/spreadsheets
- **Wait between scrapes**: 30+ minutes between large scrapes

### ❌ Don't

- Scrape continuously without delays
- Use expired/invalid cookies
- Ignore rate limit warnings
- Scrape thousands of profiles in one session

---

## Troubleshooting

### Problem: 0 Employees Found

**Solution**: Run with debug mode

```bash
DEBUG=1 npm start -- --company <URL> --limit 5
# Check: data/debug-company-page.png
```

### Problem: Redirected to Login

**Solution**: Refresh your `li_at` cookie  
See [COOKIE_TROUBLESHOOTING.md](./COOKIE_TROUBLESHOOTING.md)

### Problem: "Access restriction detected"

Some companies require LinkedIn Premium or Sales Navigator to view full employee lists.

---

## Example Commands

```bash
# Quick test
npm start -- --company https://www.linkedin.com/company/rebel-foods/ --limit 10

# With emails
npm start -- --company https://www.linkedin.com/company/github/ --limit 50 --domain github.com

# CSV export
npm start -- --company https://www.linkedin.com/company/stripe/ --limit 100 --domain stripe.com --csv

# Debug mode
DEBUG=1 npm start -- --company https://www.linkedin.com/company/spotify/ --limit 5
```

---

## Rate Limiting & Ethics

### Built-in Rate Limiting

- Delays between scrolls (1-2 seconds)
- Delays between button clicks (2-3 seconds)
- Random jitter to appear human

### Ethical Usage

This tool is intended for legitimate recruiting and talent research.

**Respect rate limits**: Wait 30+ minutes between large scrapes.

---

## Support

For issues:

1. Check [COOKIE_TROUBLESHOOTING.md](./COOKIE_TROUBLESHOOTING.md)
2. Run with `DEBUG=1` for verbose output
3. Check `data/debug-company-page.png` screenshot
