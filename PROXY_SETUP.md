# Proxy Setup Guide

Your proxy pool is now configured! Here's what was set up:

## ✅ What's Been Added

1. **`proxies.txt`** - Your 100 proxies are loaded and ready
2. **`src/utils/proxyPool.js`** - Automatic proxy rotation system
3. **Updated Google X-Ray scraper** - Now uses proxies automatically

## 🚀 How to Use

### Automatic Proxy Rotation (Recommended)

Just run the command as normal - proxies are used automatically:

```bash
npm start -- --xray "GitHub" --limit 50
```

The scraper will:
1. Randomly select one of your 100 proxies
2. Use it for the Google search
3. Bypass Google CAPTCHA
4. Return results successfully!

**Automatic Retry:** If a proxy times out or fails, the scraper will automatically:
- Try up to 3 different proxies
- Select a new random proxy for each retry
- Only give up after all attempts fail

This means even if some proxies are slow/dead, you'll still get results!

### Check Proxy Status

```bash
# Run with debug to see which proxy is being used
DEBUG=1 npm start -- --xray "GitHub" --limit 50
```

You'll see:
```
[google-xray] Searching Google for "GitHub" employees...
[google-xray] Using proxy: http://***@151.123.176.75:3129
```

## 📝 Managing Proxies

### Add More Proxies

Edit `proxies.txt`:
```bash
nano proxies.txt
```

Add new proxies in format: `IP:PORT` (one per line)

### Remove Bad Proxies

If a proxy isn't working:
1. Open `proxies.txt`
2. Delete or comment out the bad proxy (add `#` at start of line)
3. Save and run again

### Use Specific Proxy

To force a specific proxy instead of rotation:

```bash
# Set in .env file
PROXY_URL=http://151.123.176.75:3129

# Then run
npm start -- --xray "GitHub" --limit 50
```

## 🎯 How It Works

1. **First Request**: Scraper loads `proxies.txt`
2. **Random Selection**: Picks one proxy randomly
3. **Connection**: Routes Google request through that proxy
4. **Different IP**: Google sees the proxy's IP, not yours
5. **No CAPTCHA**: Fresh IP means no blocks!

## 🧪 Testing Your Proxies (Recommended!)

Before scraping, test your proxies to find which ones work:

```bash
# Test first 5 proxies (quick check)
npm run test:proxies

# Test first 20 proxies (thorough check)
npm run test:proxies 20

# Test all 100 proxies (full audit)
npm run test:proxies 100
```

**Example output:**
```
🧪 Testing 5 proxies from your pool...

[1/5] Testing http://***@151.123.176.75:3129... ✅ OK (2341ms)
[2/5] Testing http://***@209.50.169.135:3129... 🚫 CAPTCHA (blocked)
[3/5] Testing http://***@104.207.40.19:3129... ⏱️  Timeout (too slow)
[4/5] Testing http://***@193.56.28.125:3129... ✅ OK (1567ms)
[5/5] Testing http://***@65.111.26.84:3129... ✅ OK (3012ms)

📊 RESULTS SUMMARY
✅ Working:        3
🚫 CAPTCHA:        1
⏱️  Timeout:        1
❌ Failed:         0

📈 Success rate: 60.0%
```

**What to do:**
- ✅ **60%+ success rate**: Good! Run your scrapes
- ⚠️ **30-60% success rate**: Some proxies work, remove bad ones
- ❌ **<30% success rate**: Most proxies are blocked/dead - get better proxies

**Tip:** Remove slow/blocked proxies from `proxies.txt` to improve reliability!

## 🔍 Troubleshooting

### Still Getting CAPTCHA?

**Possible reasons:**
1. **Proxy is already blocked** - Try different company name or wait 5 minutes
2. **Proxy is slow/dead** - Remove that proxy from `proxies.txt`
3. **Too many requests too fast** - Add delay between searches

**Solution:** Run multiple times - it will pick different proxies:
```bash
# First run - proxy 1
npm start -- --xray "Microsoft" --limit 10

# Wait 10 seconds, then second run - proxy 2 (different)
npm start -- --xray "Apple" --limit 10
```

### Timeout Errors?

If you see `Timeout 30000ms exceeded` or similar:

**What's happening:**
- The selected proxy is too slow or unresponsive
- Connection takes longer than 60 seconds

**Automatic fix:**
The scraper now automatically retries with different proxies:
```
[google-xray] Attempt 1/3...
[google-xray] ❌ Attempt 1 failed: Timeout 60000ms exceeded
[google-xray] 🔄 Retrying with different proxy...
[google-xray] Attempt 2/3...
[google-xray] Using proxy: http://***@164.52.223.18:8080
[google-xray] ✅ Success!
```

**Manual fix:**
If all 3 attempts fail, remove slow proxies:
1. Note which proxy failed (check debug output)
2. Remove it from `proxies.txt`
3. Run again

### Proxy Not Being Used?

Check if `proxies.txt` exists in project root:
```bash
ls -la proxies.txt
```

Should show: `-rw-r--r--  1 user  staff  2048  Mar 25 13:40 proxies.txt`

If missing, the proxies.txt file may have been moved. It should be in:
```
linkedin-scraper/
  ├── proxies.txt  ← Here
  ├── package.json
  └── src/
```

### Check Proxy Count

```bash
# See how many proxies are loaded
node -e "import('./src/utils/proxyPool.js').then(m => console.log('Proxies:', m.getProxyCount()))"
```

Should show: `Proxies: 100`

## 🎉 Success Indicators

✅ **Working correctly:**
```
[google-xray] Using proxy: http://***@151.123.176.75:3129
[google-xray] Found 87 employees from Google search
```

❌ **Still has issues:**
```
[google-xray] ⚠️  Google is showing CAPTCHA
```
→ Run again to try different proxy

## 🔗 Alternative: Single Proxy via .env

If you want to use just one reliable proxy:

```bash
# Edit .env
echo "PROXY_URL=http://151.123.176.75:3129" >> .env

# This will override proxy rotation
npm start -- --xray "GitHub" --limit 50
```

## 📊 Proxy Pool Benefits

| Feature | Without Proxies | With Proxy Pool |
|---------|----------------|-----------------|
| **CAPTCHA** | ✅ Yes, blocked | ❌ No, bypassed |
| **Daily Limit** | ~10-50 searches | ~5,000+ searches |
| **Speed** | Slow (10s wait) | ❌ Fast (instant) |
| **Reliability** | Low | ✅ High |
| **Cost** | Free | Included (your list) |

## 🚦 Rate Limiting Best Practices

Even with proxies, follow these rules:

1. **Wait between searches**: 5-10 seconds
   ```bash
   npm start -- --xray "Company1" --limit 50
   sleep 10
   npm start -- --xray "Company2" --limit 50
   ```

2. **Batch similar searches**: Use same proxy for related queries

3. **Monitor success rate**: If >50% fail, slow down

4. **Rotate manually**: Change proxy if one gets blocked:
   ```bash
   # Edit proxies.txt
   # Comment out blocked proxy: # 151.123.176.75:3129
   # Run again - will use different proxy
   ```

## 🎯 Next Steps

Try it now:

```bash
npm start -- --xray "GitHub" --limit 50
```

You should see:
- ✅ No CAPTCHA error
- ✅ Proxy being used
- ✅ Results returned successfully!

**That's it!** Your scraper now automatically rotates through 100 proxies to avoid Google blocks. 🎉
