// Default configuration for the LinkedIn scraper
// All values can be overridden via CLI flags or environment variables

export default {
  // Delay between page navigations (ms) — jitter applied on top
  delay: {
    minMs: 3000,
    maxMs: 8000,
  },

  // Delay between scroll events when paginating (ms)
  scrollDelay: {
    minMs: 1500,
    maxMs: 3500,
  },

  // Maximum number of employees to scrape per company (0 = no limit)
  maxEmployees: 100,

  // Retry configuration for failed requests
  retry: {
    maxAttempts: 3,
    baseBackoffMs: 30000, // 30s × attempt number
  },

  // Playwright browser settings
  browser: {
    headless: false, // headful mode reduces fingerprint divergence
    slowMo: 50, // slight slow-down mimics human interaction timing
    timeout: 60000, // page navigation timeout (ms) — LinkedIn is a heavy SPA
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  },

  // Output directory (relative to project root)
  outputDir: "./data",

  // LinkedIn domain
  linkedinBase: "https://www.linkedin.com",
};
