# LinkedIn Scraper REST API Documentation

## Overview

REST API server for scraping LinkedIn company and profile data.

**Base URL**: `http://localhost:3000`  
**Default Port**: 3000 (configurable via `PORT` environment variable)

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Cookie

Create `.env` file with your LinkedIn cookie:

```bash
LINKEDIN_COOKIE=your_li_at_cookie_here
```

See [COOKIE_TROUBLESHOOTING.md](./COOKIE_TROUBLESHOOTING.md) for cookie extraction guide.

### 3. Start Server

```bash
npm run server
```

Server will start on `http://localhost:3000`

### 4. Test API

```bash
curl http://localhost:3000/health
```

---

## API Endpoints

### 1. Health Check

**GET** `/health`

Check if the server is running.

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2026-03-24T10:30:00.000Z",
  "version": "2.0.0"
}
```

**Example:**

```bash
curl http://localhost:3000/health
```

---

### 2. Scrape Company Employees

**POST** `/api/scrape/company`

Scrape employee list from a LinkedIn company page.

**Request Body:**

```json
{
  "url": "https://www.linkedin.com/company/rebel-foods/",
  "limit": 50,
  "domain": "rebel-foods.com"
}
```

**Parameters:**
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `url` | string | ✅ Yes | - | LinkedIn company URL |
| `limit` | number | No | 50 | Max employees to scrape (max: 500) |
| `domain` | string | No | - | Company domain for email inference |

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "employees": [
      {
        "name": "Jane Doe",
        "title": "Senior Product Manager",
        "profileUrl": "https://linkedin.com/in/jane-doe",
        "seniority": "senior",
        "emailPattern": "jane.doe@rebel-foods.com"
      }
    ],
    "meta": {
      "sourceUrl": "https://www.linkedin.com/company/rebel-foods/",
      "scrapedAt": "2026-03-24T10:30:00.000Z",
      "totalCollected": 50
    }
  },
  "meta": {
    "scrapedAt": "2026-03-24T10:30:00.000Z",
    "totalCollected": 50,
    "requestedLimit": 50
  }
}
```

**Error Response (400):**

```json
{
  "error": "Invalid LinkedIn company URL",
  "provided": "https://example.com",
  "expected": "https://www.linkedin.com/company/{company-name}/"
}
```

**Error Response (500):**

```json
{
  "success": false,
  "error": "Cookie expired or invalid",
  "type": "Error",
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

**cURL Example:**

```bash
curl -X POST http://localhost:3000/api/scrape/company \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/company/github/",
    "limit": 20,
    "domain": "github.com"
  }'
```

**JavaScript Example:**

```javascript
const response = await fetch("http://localhost:3000/api/scrape/company", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: "https://www.linkedin.com/company/github/",
    limit: 20,
    domain: "github.com",
  }),
});

const data = await response.json();
console.log(data.data.employees);
```

---

### 3. Scrape Individual Profile

**POST** `/api/scrape/profile`

Scrape detailed information from a LinkedIn profile.

**Request Body:**

```json
{
  "url": "https://www.linkedin.com/in/williamhgates/"
}
```

**Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | ✅ Yes | LinkedIn profile URL |

**Success Response (200):**

```json
{
  "success": true,
  "data": {
    "name": "Bill Gates",
    "headline": "Co-chair, Bill & Melinda Gates Foundation",
    "location": "Seattle, Washington, United States",
    "profileUrl": "https://www.linkedin.com/in/williamhgates",
    "connections": "500+",
    "about": "Co-chair of the Bill & Melinda Gates Foundation...",
    "experience": [
      {
        "company": "Bill & Melinda Gates Foundation",
        "title": "Co-chair",
        "employmentType": "Full-time",
        "startDate": "Jan 2000",
        "endDate": "Present",
        "duration": "24 yrs 3 mos",
        "location": "Seattle, Washington"
      }
    ],
    "education": [
      {
        "school": "Harvard University",
        "degree": "",
        "field": "",
        "startDate": "1973",
        "endDate": "1975"
      }
    ],
    "skills": ["Leadership", "Public Speaking", "Strategic Planning"],
    "projects": [],
    "scrapedAt": "2026-03-24T10:30:00.000Z"
  },
  "meta": {
    "scrapedAt": "2026-03-24T10:30:00.000Z"
  }
}
```

**cURL Example:**

```bash
curl -X POST http://localhost:3000/api/scrape/profile \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.linkedin.com/in/williamhgates/"
  }'
```

---

### 4. Batch Scraping

**POST** `/api/scrape/batch`

Scrape multiple profiles or companies in one request.

**Request Body:**

```json
{
  "urls": [
    "https://www.linkedin.com/in/williamhgates/",
    "https://www.linkedin.com/in/satyanadella/",
    "https://www.linkedin.com/in/jeffweiner08/"
  ],
  "type": "profile",
  "domain": "microsoft.com"
}
```

**Parameters:**
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `urls` | array | ✅ Yes | - | Array of LinkedIn URLs (max: 50) |
| `type` | string | No | "profile" | Type: "profile" or "company" |
| `domain` | string | No | - | Company domain for email inference |

**Success Response (200):**

```json
{
  "success": true,
  "meta": {
    "total": 3,
    "successful": 2,
    "failed": 1,
    "scrapedAt": "2026-03-24T10:30:00.000Z"
  },
  "results": [
    {
      "url": "https://linkedin.com/in/williamhgates",
      "success": true,
      "data": { "name": "Bill Gates", ... }
    },
    {
      "url": "https://linkedin.com/in/satyanadella",
      "success": true,
      "data": { "name": "Satya Nadella", ... }
    },
    {
      "url": "https://linkedin.com/in/jeffweiner08",
      "success": false,
      "error": "Profile not accessible"
    }
  ],
  "errors": [
    {
      "url": "https://linkedin.com/in/jeffweiner08",
      "error": "Profile not accessible"
    }
  ]
}
```

**cURL Example:**

```bash
curl -X POST http://localhost:3000/api/scrape/batch \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://linkedin.com/in/williamhgates",
      "https://linkedin.com/in/satyanadella"
    ],
    "type": "profile"
  }'
```

---

### 5. 🆕 Google X-Ray Search (No Auth Required)

**POST** `/api/scrape/xray`

Search for company employees via Google X-Ray search - **no LinkedIn authentication required!**

**Request Body:**

```json
{
  "companyName": "GitHub",
  "limit": 50
}
```

**Parameters:**
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `companyName` | string | ✅ Yes | - | Company name to search (e.g. "GitHub", "Microsoft") |
| `limit` | number | No | 50 | Max results to return (max: 100) |

**Success Response (200):**

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
      },
      {
        "name": "John Smith",
        "title": "Product Manager",
        "profileUrl": "https://linkedin.com/in/john-smith",
        "snippet": "Product Manager at GitHub. Building developer tools..."
      }
    ],
    "meta": {
      "source": "google-xray-search",
      "searchQuery": "site:linkedin.com/in/ \"GitHub\"",
      "companyName": "GitHub",
      "totalFound": 87,
      "returned": 50,
      "scrapedAt": "2026-03-25T10:30:00.000Z",
      "note": "Data extracted from Google search results - limited to publicly visible information"
    }
  },
  "meta": {
    "scrapedAt": "2026-03-25T10:30:00.000Z",
    "source": "google-xray-search",
    "authRequired": false,
    "dataQuality": "limited",
    "note": "Results from Google search - includes name, title, and profile URL only"
  }
}
```

**cURL Example:**

```bash
curl -X POST http://localhost:3000/api/scrape/xray \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "GitHub",
    "limit": 50
  }'
```

**JavaScript Example:**

```javascript
const response = await fetch("http://localhost:3000/api/scrape/xray", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    companyName: "GitHub",
    limit: 50,
  }),
});

const { data } = await response.json();
console.log(`Found ${data.employees.length} employees`);
data.employees.forEach((emp) => {
  console.log(`${emp.name} - ${emp.title || "N/A"}`);
});
```

**Trade-offs:**

✅ **Advantages:**

- No LinkedIn authentication required
- Faster than direct scraping (~0.5s vs 12-15s per profile)
- Lower detection risk
- Can scale to higher volumes

❌ **Limitations:**

- Limited data (name, title\*, profile URL only)
- No email patterns, seniority, or detailed experience
- Google search result cap (~100 profiles max)
- Titles may be missing or inaccurate
- Subject to Google rate limits

See [docs/GOOGLE_XRAY_GUIDE.md](docs/GOOGLE_XRAY_GUIDE.md) for complete guide and best practices.

---

## Rate Limiting & Constraints

| Constraint                          | Limit                 | Reason                                 |
| ----------------------------------- | --------------------- | -------------------------------------- |
| Max employees per company request   | 500                   | LinkedIn rate limits + processing time |
| Max URLs per batch request          | 50                    | Processing time + memory               |
| Concurrent requests                 | Sequential processing | Avoid account suspension               |
| Daily profile scrapes (per account) | ~100-150              | LinkedIn rate limits                   |

**Recommendations:**

- Start with small limits (10-20) for testing
- Space requests 5-10 seconds apart for large scrapes
- Use batch endpoint for multiple profiles
- Monitor for rate limit errors

---

## Error Handling

### Common Error Responses

**400 Bad Request - Missing URL:**

```json
{
  "error": "Missing required field: url",
  "example": {
    "url": "https://www.linkedin.com/company/example-company/",
    "limit": 50
  }
}
```

**400 Bad Request - Invalid URL:**

```json
{
  "error": "Invalid LinkedIn company URL",
  "provided": "https://example.com",
  "expected": "https://www.linkedin.com/company/{company-name}/"
}
```

**400 Bad Request - Limit Exceeded:**

```json
{
  "error": "Limit cannot exceed 500 employees per request",
  "provided": 1000,
  "max": 500,
  "recommendation": "Use batch endpoint for larger scrapes"
}
```

**404 Not Found:**

```json
{
  "error": "Endpoint not found",
  "path": "/api/wrong-endpoint",
  "method": "POST",
  "availableEndpoints": {
    "GET /health": "Health check",
    "POST /api/scrape/company": "Scrape company employee list",
    "POST /api/scrape/profile": "Scrape individual profile",
    "POST /api/scrape/batch": "Scrape multiple URLs"
  },
  "documentation": "See API.md for detailed documentation"
}
```

**500 Internal Server Error:**

```json
{
  "success": false,
  "error": "LinkedIn cookie is expired or invalid",
  "type": "Error",
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

---

## Configuration

### Environment Variables

Create `.env` file in project root:

```bash
# LinkedIn session cookie (required)
LINKEDIN_COOKIE=your_li_at_cookie_here

# Server port (optional, default: 3000)
PORT=3000

# Debug mode (optional)
DEBUG=false
```

### Custom Port

```bash
PORT=8080 npm run server
```

---

## Development

### Development Mode (Auto-restart)

```bash
npm install  # Install dependencies including nodemon
npm run dev  # Server restarts on file changes
```

### Production Mode

```bash
npm run server
```

---

## Integration Examples

### Node.js / JavaScript

```javascript
import axios from "axios";

async function scrapeCompany(companyUrl, limit = 50) {
  try {
    const response = await axios.post(
      "http://localhost:3000/api/scrape/company",
      {
        url: companyUrl,
        limit: limit,
        domain: "company.com",
      },
    );

    return response.data.data.employees;
  } catch (error) {
    console.error("Scraping error:", error.response?.data || error.message);
    throw error;
  }
}

// Usage
const employees = await scrapeCompany(
  "https://linkedin.com/company/github",
  20,
);
console.log(`Found ${employees.length} employees`);
employees.forEach((emp) => {
  console.log(`${emp.name} - ${emp.title}`);
});
```

### Python

```python
import requests

def scrape_company(company_url, limit=50):
    response = requests.post(
        'http://localhost:3000/api/scrape/company',
        json={'url': company_url, 'limit': limit}
    )
    response.raise_for_status()
    return response.json()['data']['employees']

# Usage
employees = scrape_company('https://linkedin.com/company/github', 20)
print(f"Found {len(employees)} employees")
for emp in employees:
    print(f"{emp['name']} - {emp['title']}")
```

### cURL with jq (JSON parsing)

```bash
# Scrape and extract names only
curl -s -X POST http://localhost:3000/api/scrape/company \
  -H "Content-Type: application/json" \
  -d '{"url":"https://linkedin.com/company/github","limit":5}' \
  | jq -r '.data.employees[].name'

# Scrape and save to file
curl -s -X POST http://localhost:3000/api/scrape/company \
  -H "Content-Type: application/json" \
  -d '{"url":"https://linkedin.com/company/github","limit":50}' \
  | jq '.data.employees' > employees.json
```

---

## Testing the API

### Manual Testing

1. **Start server:**

   ```bash
   npm run server
   ```

2. **Health check:**

   ```bash
   curl http://localhost:3000/health
   ```

3. **Test company scraping:**

   ```bash
   curl -X POST http://localhost:3000/api/scrape/company \
     -H "Content-Type: application/json" \
     -d '{"url":"https://linkedin.com/company/github","limit":5}'
   ```

4. **Test profile scraping:**
   ```bash
   curl -X POST http://localhost:3000/api/scrape/profile \
     -H "Content-Type: application/json" \
     -d '{"url":"https://linkedin.com/in/williamhgates"}'
   ```

### Using Postman

1. Import collection or create requests manually
2. Set method to POST
3. URL: `http://localhost:3000/api/scrape/company`
4. Headers: `Content-Type: application/json`
5. Body (raw JSON):
   ```json
   {
     "url": "https://linkedin.com/company/github",
     "limit": 10
   }
   ```

---

## Troubleshooting

### Server won't start

**Check port availability:**

```bash
lsof -i :3000
# Kill process if needed: kill -9 <PID>
```

**Verify dependencies:**

```bash
npm install
```

### Getting 0 results

**Check cookie:**

- Cookie may be expired
- Update `LINKEDIN_COOKIE` in `.env`
- See [COOKIE_TROUBLESHOOTING.md](./COOKIE_TROUBLESHOOTING.md)

**Enable debug mode:**

```bash
DEBUG=1 npm run server
```

### Rate limit errors

**Solution:**

- Reduce `limit` parameter
- Add delays between requests
- Use multiple LinkedIn accounts (cookie rotation)

### Slow performance

**Optimization:**

- Reduce `limit` for company scrapes
- Use batch endpoint efficiently (max 50 URLs)
- Check network connection
- Consider using multiple workers for scale

---

## Security Considerations

⚠️ **Important Security Notes:**

1. **Cookie Security:**
   - Never commit `.env` file to version control
   - Keep `li_at` cookie private
   - Rotate cookies periodically

2. **Production Deployment:**
   - Use HTTPS (reverse proxy like nginx)
   - Add API key authentication
   - Implement rate limiting (e.g., `express-rate-limit`)
   - Use environment variables for secrets

3. **Rate Limiting:**

   ```javascript
   import rateLimit from "express-rate-limit";

   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100, // limit each IP to 100 requests per windowMs
   });

   app.use("/api/", limiter);
   ```

---

## Deployment

### Docker (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "server"]
```

**Build and run:**

```bash
docker build -t linkedin-scraper .
docker run -p 3000:3000 --env-file .env linkedin-scraper
```

### Cloud Deployment

**Heroku:**

```bash
# Procfile
web: npm run server

# Deploy
heroku create my-linkedin-scraper
git push heroku main
```

**AWS EC2:**

```bash
# Install Node.js and PM2
npm install -g pm2
pm2 start src/server.js --name linkedin-scraper
pm2 save
```

---

## CLI Mode Still Available

The original CLI commands work alongside the API:

```bash
# CLI scraping (original)
npm start -- --company <url> --limit 50

# API server (new)
npm run server
```

Both modes use the same scraper core! 🚀

---

## Support

**Documentation:**

- [README.md](./README.md) - Getting started
- [COMPANY_SCRAPING_GUIDE.md](./COMPANY_SCRAPING_GUIDE.md) - Company scraping details
- [COOKIE_TROUBLESHOOTING.md](./COOKIE_TROUBLESHOOTING.md) - Cookie setup help

**Common Issues:**

- Cookie expired → Update in `.env`
- Port in use → Change PORT or kill process
- Rate limited → Wait 24 hours or use different account

---

## API Version

**Current Version:** 2.0.0

**Changelog:**

- `2.0.0` - Added REST API server
- `1.0.0` - Initial CLI release
