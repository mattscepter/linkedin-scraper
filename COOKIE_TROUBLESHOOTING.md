# Cookie Troubleshooting Guide

## ERR_TOO_MANY_REDIRECTS Error

This error means your LinkedIn cookie (`li_at`) is **expired or invalid**.

### Quick Fix (5 minutes)

1. **Open LinkedIn in Chrome/Firefox**
   - Go to https://www.linkedin.com
   - **Make sure you're logged in**

2. **Open Developer Tools**
   - Press `F12` (Windows/Linux) or `Cmd+Option+I` (Mac)
   - Or right-click anywhere → "Inspect"

3. **Navigate to Cookies**
   - Click the **"Application"** tab (Chrome) or **"Storage"** tab (Firefox)
   - In the left sidebar: **Cookies** → `https://www.linkedin.com`

4. **Copy the `li_at` cookie**
   - Find the row with name `li_at`
   - Double-click the **Value** column
   - Copy the entire value (it's a long string like `AQExxxxxx...`)

5. **Create/Update `.env` file**

   ```bash
   cd /Users/utkarshchaudhary/Desktop/Personal/linkedin-scraper

   # Create .env file if it doesn't exist
   cp .env.example .env

   # Edit .env with your favorite editor
   nano .env
   ```

6. **Paste your cookie**

   ```
   LINKEDIN_COOKIE=AQExxxxxx... (your copied value here)
   ```

7. **Save and test**
   ```bash
   npm start -- --company https://www.linkedin.com/company/rebel-foods/ --limit 5
   ```

---

## Visual Guide

### Chrome DevTools Screenshot

```
Application Tab
├── Storage
│   ├── Local Storage
│   ├── Session Storage
│   └── Cookies
│       └── https://www.linkedin.com  ← CLICK HERE
│           ├── li_at                 ← THIS ONE
│           ├── bcookie
│           └── ... (other cookies)
```

**Copy the Value:**

```
Name:   li_at
Value:  AQEDARbxNxwDMq1wA...  ← COPY THIS ENTIRE STRING
Domain: .linkedin.com
Path:   /
```

---

## Common Issues

### Issue: Cookie still doesn't work

**Solution**:

- Make sure you're copying the **entire** value (can be 200+ characters)
- No extra spaces before/after the value
- Cookie expires after ~1 year - you'll need to refresh it periodically

### Issue: "LINKEDIN_COOKIE is not set" error

**Solution**:

- .env file doesn't exist, or
- .env file has wrong format

```bash
# Check if .env exists
ls -la .env

# If not, create it
cp .env.example .env
nano .env
```

### Issue: Cookie works but gets 0 results

**Possible causes**:

- Company's employee list is private
- LinkedIn is rate limiting you (wait 24 hours)
- Company requires Premium/Sales Navigator access

Run with debug mode:

```bash
DEBUG=1 npm start -- --company <URL> --limit 5
```

---

## Testing Your Cookie

Quick test to verify cookie is working:

```bash
# Test profile scraper (faster)
npm start -- --profile https://www.linkedin.com/in/williamhgates/ --output test

# If that works, your cookie is valid
# If you get redirect errors, cookie is expired
```

---

## Cookie Lifetime

- LinkedIn `li_at` cookies typically last **~1 year**
- If you log out of LinkedIn, the cookie becomes invalid
- If LinkedIn detects unusual activity, they may invalidate your session

**Best practice**: Bookmark this guide and re-copy your cookie whenever you get redirect errors.

---

## Security Note

⚠️ **NEVER share your `li_at` cookie** - it's like your LinkedIn password!

- Don't commit `.env` to Git (already in `.gitignore`)
- Don't paste it in public forums or screenshots
- Don't share it with anyone

Keep your `.env` file private.
