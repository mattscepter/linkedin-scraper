import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { loadCookies } from "../utils/cookies.js";
import defaults from "../../config/defaults.js";

// Apply all stealth evasion patches before any browser is launched
chromium.use(StealthPlugin());

/**
 * Launches a Playwright browser with stealth plugin and injects LinkedIn
 * session cookies. Returns browser, context, and a ready page.
 *
 * All scraping operations should share this context to maintain session state.
 *
 * @returns {Promise<{ browser: import('playwright').Browser,
 *                     context: import('playwright').BrowserContext,
 *                     page: import('playwright').Page }>}
 */
export async function createBrowser() {
  const { headless, slowMo, viewport, userAgent, timeout } = defaults.browser;
  const proxy = process.env.PROXY_URL
    ? { server: process.env.PROXY_URL }
    : undefined;

  const browser = await chromium.launch({
    headless,
    slowMo,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
    ...(proxy && { proxy }),
  });

  const context = await browser.newContext({
    viewport,
    userAgent,
    locale: "en-US",
    timezoneId: "America/New_York",
    // Prevent LinkedIn from detecting headless via permissions fingerprint
    permissions: ["geolocation"],
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  // Inject session cookies — must be done before any navigation
  const cookies = loadCookies();
  await context.addCookies(cookies);

  // Set a realistic default navigation timeout
  context.setDefaultNavigationTimeout(timeout);
  context.setDefaultTimeout(timeout);

  const page = await context.newPage();

  return { browser, context, page };
}
