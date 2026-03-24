import express from "express";
import cors from "cors";
import { runCompanyScrape } from "./commands/scrapeCompany.js";
import { runProfileScrape } from "./commands/scrapeProfile.js";
import { validateLinkedInUrl } from "./utils/validation.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "2.0.0",
  });
});

// Company scraping endpoint
app.post("/api/scrape/company", async (req, res) => {
  try {
    const { url, limit = 50, domain } = req.body;

    // Validation
    if (!url) {
      return res.status(400).json({
        error: "Missing required field: url",
        example: {
          url: "https://www.linkedin.com/company/example-company/",
          limit: 50,
          domain: "company.com",
        },
      });
    }

    if (!validateLinkedInUrl(url, "company")) {
      return res.status(400).json({
        error: "Invalid LinkedIn company URL",
        provided: url,
        expected: "https://www.linkedin.com/company/{company-name}/",
      });
    }

    if (limit > 500) {
      return res.status(400).json({
        error: "Limit cannot exceed 500 employees per request",
        provided: limit,
        max: 500,
        recommendation: "Use batch endpoint for larger scrapes",
      });
    }

    console.log(`[API] Scraping company: ${url} (limit: ${limit})`);

    // Execute scraping
    const result = await runCompanyScrape(url, {
      limit: parseInt(limit),
      domain,
      csv: false,
    });

    res.json({
      success: true,
      data: result,
      meta: {
        scrapedAt: new Date().toISOString(),
        totalCollected: result.employees?.length || 0,
        requestedLimit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("[API] Company scraping error:", error);

    res.status(500).json({
      success: false,
      error: error.message,
      type: error.name,
      timestamp: new Date().toISOString(),
    });
  }
});

// Profile scraping endpoint
app.post("/api/scrape/profile", async (req, res) => {
  try {
    const { url } = req.body;

    // Validation
    if (!url) {
      return res.status(400).json({
        error: "Missing required field: url",
        example: {
          url: "https://www.linkedin.com/in/example-user/",
        },
      });
    }

    if (!validateLinkedInUrl(url, "profile")) {
      return res.status(400).json({
        error: "Invalid LinkedIn profile URL",
        provided: url,
        expected: "https://www.linkedin.com/in/{username}/",
      });
    }

    console.log(`[API] Scraping profile: ${url}`);

    // Execute scraping
    const result = await runProfileScrape(url, {});

    res.json({
      success: true,
      data: result,
      meta: {
        scrapedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[API] Profile scraping error:", error);

    res.status(500).json({
      success: false,
      error: error.message,
      type: error.name,
      timestamp: new Date().toISOString(),
    });
  }
});

// Batch scraping endpoint
app.post("/api/scrape/batch", async (req, res) => {
  try {
    const { urls, type = "profile", domain } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        error: "Missing or invalid field: urls (must be a non-empty array)",
        example: {
          urls: [
            "https://linkedin.com/in/user1",
            "https://linkedin.com/in/user2",
          ],
          type: "profile",
        },
      });
    }

    if (urls.length > 50) {
      return res.status(400).json({
        error: "Batch size cannot exceed 50 URLs per request",
        provided: urls.length,
        max: 50,
        recommendation: "Split your requests into smaller batches",
      });
    }

    if (!["profile", "company"].includes(type)) {
      return res.status(400).json({
        error: "Invalid type parameter",
        provided: type,
        allowed: ["profile", "company"],
      });
    }

    console.log(`[API] Batch scraping ${urls.length} ${type}s`);

    const results = [];
    const errors = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        console.log(`[API] Batch progress: ${i + 1}/${urls.length} - ${url}`);

        let result;
        if (type === "profile") {
          result = await runProfileScrape(url, {});
        } else if (type === "company") {
          result = await runCompanyScrape(url, { limit: 50, domain });
        }

        results.push({ url, success: true, data: result });
      } catch (error) {
        console.error(`[API] Batch error for ${url}:`, error.message);
        errors.push({ url, error: error.message });
        results.push({ url, success: false, error: error.message });
      }
    }

    res.json({
      success: true,
      meta: {
        total: urls.length,
        successful: results.filter((r) => r.success).length,
        failed: errors.length,
        scrapedAt: new Date().toISOString(),
      },
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("[API] Batch scraping error:", error);

    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    path: req.path,
    method: req.method,
    availableEndpoints: {
      "GET /health": "Health check",
      "POST /api/scrape/company": "Scrape company employee list",
      "POST /api/scrape/profile": "Scrape individual profile",
      "POST /api/scrape/batch": "Scrape multiple URLs",
    },
    documentation: "See API.md for detailed documentation",
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("[API] Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: err.message,
    timestamp: new Date().toISOString(),
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`\n🚀 LinkedIn Scraper API Server`);
  console.log(`📡 Running on: http://localhost:${PORT}`);
  console.log(`\n📋 Available endpoints:`);
  console.log(`   GET  /health                 - Health check`);
  console.log(`   POST /api/scrape/company     - Scrape company employees`);
  console.log(`   POST /api/scrape/profile     - Scrape individual profile`);
  console.log(`   POST /api/scrape/batch       - Scrape multiple URLs`);
  console.log(`\n💡 Example request:`);
  console.log(`   curl -X POST http://localhost:${PORT}/api/scrape/company \\`);
  console.log(`        -H "Content-Type: application/json" \\`);
  console.log(
    `        -d '{"url":"https://linkedin.com/company/github","limit":10}'`,
  );
  console.log(`\n📖 Documentation: See API.md for complete reference`);
  console.log(`\n`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("\n🛑 SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("\n🛑 SIGINT received, shutting down gracefully...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});

export default app;
