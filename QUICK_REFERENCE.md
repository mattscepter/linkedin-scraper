# Quick Reference Card

## 🚀 Basic Usage

```bash
npm start -- --company <URL> --limit 100
```

**Output**: Name, title, profile URL, seniority, email pattern  
**Speed**: ~30-45 seconds for 100 employees  
**Use for**: Employee lists, lead generation, talent analysis

## ⚙️ Common Commands

```bash
# Quick test (10 employees)
npm start -- --company https://www.linkedin.com/company/rebel-foods/ --limit 10

# Medium scrape (50 employees)
npm start -- --company https://www.linkedin.com/company/github/ --limit 50 --domain github.com

# CSV export
npm start -- --company https://www.linkedin.com/company/stripe/ --limit 50 --domain stripe.com --csv

# Debug mode
DEBUG=1 npm start -- --company <URL> --limit 5
```

## 📊 Output Fields

| Field        | Description                     |
| ------------ | ------------------------------- |
| name         | Full name                       |
| title        | Current job title/headline      |
| profileUrl   | LinkedIn profile URL            |
| seniority    | Inferred level (junior/mid/etc) |
| emailPattern | Guessed email (with --domain)   |

## ⏱️ Time Estimates

- 10 employees: ~6-11 seconds
- 50 employees: ~16-27 seconds
- 100 employees: ~32-48 seconds
- 200+ employees: ~1-2 minutes

## 🔥 Pagination

The scraper **automatically** handles "Show more results" buttons:

1. Scrolls to bottom
2. Clicks "Show more" button
3. Repeats until limit reached

**No manual intervention needed!**

## ⚠️ Best Practices

✅ **Do**:

- Start small: `--limit 10` for testing
- Keep `li_at` cookie fresh
- Wait 30+ min between large scrapes
- Use `--domain` flag for email inference

❌ **Don't**:

- Scrape continuously without delays
- Ignore rate limit warnings
- Use expired cookies

## 🐛 Troubleshooting

### 0 Employees Found

```bash
# Run with debug
DEBUG=1 npm start -- --company <URL> --limit 5

# Check screenshot
open data/debug-company-page.png
```

### Redirected to Login

Cookie expired. See [COOKIE_TROUBLESHOOTING.md](./COOKIE_TROUBLESHOOTING.md)

### Access Restriction Detected

Some companies require LinkedIn Premium/Sales Navigator for full lists.

## 🔧 All Options

```
--company <url>   Company URL (required)
--limit <number>  Max employees (default: 100)
--domain <domain> For email pattern inference
--output <path>   Custom output path
--csv             Also export as CSV
```

## 📁 Output Files

- **JSON**: `data/company-<slug>.json`
- **CSV** (with --csv): `data/company-<slug>.csv`

## 💡 Pro Tips

- Test with small `--limit` first
- Use `--domain company.com` for email patterns
- Export to CSV with `--csv` for easy CRM import
- Run `DEBUG=1` if you get issues
- Update `li_at` cookie every few months
