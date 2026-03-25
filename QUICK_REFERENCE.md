# Quick Reference Card

## 🚀 Basic Usage

### Method 1: Direct LinkedIn Scraping (Requires Auth)

```bash
npm start -- --company <URL> --limit 100
```

**Output**: Name, title, profile URL, seniority, email pattern  
**Speed**: ~30-45 seconds for 100 employees  
**Use for**: Detailed employee data, email inference, seniority analysis

### Method 2: 🆕 Google X-Ray Search (No Auth!)

```bash
npm start -- --xray "Company Name" --limit 50
```

**Output**: Name, title (if available), profile URL  
**Speed**: ~5-10 seconds for 50 employees  
**Use for**: Quick employee lists, no authentication available, high-volume scraping

## 🤔 Which Method to Use?

| Feature | Direct LinkedIn | Google X-Ray |
|---------|----------------|--------------|
| Authentication | ✅ Required | ❌ Not required |
| Speed | ~0.3s/profile | ~0.2s/profile |
| Data Quality | ⭐⭐⭐⭐⭐ Complete | ⭐⭐ Basic |
| Email Patterns | ✅ Yes | ❌ No |
| Seniority | ✅ Yes | ❌ No |
| Daily Limit | 100-150 profiles | 500-1000 searches |
| Risk | Medium | Low |

**Use Direct LinkedIn when:** You need detailed data (email, seniority, experience)  
**Use Google X-Ray when:** You need quick lists, don't have auth, or scraping many companies

## ⚙️ Common Commands

### Direct LinkedIn Scraping

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

### Google X-Ray Search (No Auth)

```bash
# Basic search
npm start -- --xray "GitHub" --limit 50

# With CSV export
npm start -- --xray "Rebel Foods" --limit 100 --csv

# Multiple companies
npm start -- --xray "Microsoft"
npm start -- --xray "Apple"
npm start -- --xray "Google"
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
