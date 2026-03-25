import { chromium } from "playwright";
import { delay } from "../utils/delay.js";
import { getRandomProxy, getProxyCount } from "../utils/proxyPool.js";

/**
 * Alternative company employee scraper using Google X-Ray search.
 *
 * This approach does NOT require LinkedIn authentication - it searches Google
 * for LinkedIn profiles associated with a company name, then parses the search
 * results to extract employee names and profile URLs.
 *
 * TRADE-OFFS:
 * ✅ No LinkedIn cookie required
 * ✅ Much faster (no browser login, no pagination)
 * ✅ Less likely to trigger LinkedIn rate limits
 * ✅ Can scale to higher volumes
 *
 * ❌ Limited data (only name, title from Google snippets)
 * ❌ No email patterns, seniority, or detailed info
 * ❌ Dependent on Google search results (max ~100 results)
 * ❌ Google may rate-limit if overused
 *
 * @param {string} companyName - Company name to search for (e.g. "GitHub", "Rebel Foods")
 * @param {object} options - { limit?: number, includeTitle?: boolean }
 * @returns {Promise<{employees: object[], meta: object}>}
 */
export async function scrapeCompanyViaGoogle(companyName, options = {}) {
  const { limit = 50, includeTitle = true } = options;
  const maxRetries = 3; // Try up to 3 different proxies
  let lastError = null;

  // Show proxy pool status at start
  const proxyCount = getProxyCount();
  if (proxyCount > 0) {
    console.log(
      `[google-xray] 🌐 Proxy pool: ${proxyCount} proxies available (will try up to ${maxRetries})`,
    );
  } else {
    console.log(
      `[google-xray] ⚠️  No proxies found - using direct connection (high CAPTCHA risk)`,
    );
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[google-xray] Attempt ${attempt}/${maxRetries}...`);
      return await scrapeWithProxy(companyName, { limit, includeTitle });
    } catch (error) {
      lastError = error;

      // Determine error type for better logging
      let errorType = "Unknown";
      if (error.message.includes("CAPTCHA")) {
        errorType = "CAPTCHA detected (proxy blocked)";
      } else if (error.message.includes("Timeout")) {
        errorType = "Timeout (proxy too slow)";
      } else if (error.message.includes("net::")) {
        errorType = "Connection failed";
      }

      console.error(`[google-xray] ❌ Attempt ${attempt} failed: ${errorType}`);

      if (attempt < maxRetries) {
        console.log(
          `[google-xray] 🔄 Trying different proxy (${maxRetries - attempt} attempts left)...`,
        );
        await delay(2000, 3000); // Brief delay before retry
      } else {
        console.error(
          `[google-xray] ❌ All ${maxRetries} proxies failed. Last error: ${error.message}`,
        );
      }
    }
  }

  // All retries exhausted
  throw new Error(
    `Failed after ${maxRetries} attempts. Last error: ${lastError.message}`,
  );
}

/**
 * Internal function that performs the actual scraping with a single proxy attempt
 */
async function scrapeWithProxy(companyName, options = {}) {
  const { limit = 50, includeTitle = true } = options;

  console.log(
    `[google-xray] Searching Google for "${companyName}" employees...`,
  );

  // Get a random proxy for THIS attempt (new proxy per retry)
  const proxyUrl = process.env.PROXY_URL || getRandomProxy();

  // Parse proxy URL to extract credentials for Playwright
  let proxyConfig = null;
  if (proxyUrl) {
    try {
      // Parse proxy: https://user:pass@host:port or http://host:port
      const proxyMatch = proxyUrl.match(
        /^(https?:\/\/)(?:([^:]+):([^@]+)@)?(.+)$/,
      );

      if (proxyMatch) {
        const [, protocol, username, password, serverHost] = proxyMatch;

        // IMPORTANT: Playwright only supports HTTP proxies (not HTTPS)
        // It will tunnel HTTPS traffic through HTTP proxy using CONNECT method
        proxyConfig = {
          server: `http://${serverHost}`, // Force HTTP protocol
        };

        // Add credentials if present
        if (username && password) {
          proxyConfig.username = username;
          proxyConfig.password = password;
        }

        console.log(
          `[google-xray] Using proxy: http://${serverHost} (${username ? "authenticated" : "no auth"})`,
        );
      } else {
        console.log(`[google-xray] Using proxy: ${proxyUrl}`);
        proxyConfig = { server: proxyUrl.replace("https://", "http://") };
      }
    } catch (e) {
      console.error(`[google-xray] Error parsing proxy: ${e.message}`);
      proxyConfig = { server: proxyUrl.replace("https://", "http://") };
    }
  } else {
    const proxyCount = getProxyCount();
    if (proxyCount > 0) {
      console.log(
        `[google-xray] Warning: ${proxyCount} proxies available but none selected`,
      );
    } else {
      console.log(
        `[google-xray] ⚠️  No proxy configured - direct connection (high CAPTCHA risk)`,
      );
      console.log(
        `[google-xray] Add proxies to proxies.txt or set PROXY_URL in .env`,
      );
    }
  }

  const browser = await chromium.launch({
    headless: true, // Can use headless for Google
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    ...(proxyConfig && { proxy: proxyConfig }),
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "en-US",
    });

    const page = await context.newPage();

    // Build Google X-Ray search query
    // site:linkedin.com/in/ "Company Name" - finds all LinkedIn profiles mentioning company
    const searchQuery = includeTitle
      ? `site:linkedin.com/in/ "${companyName}"`
      : `site:linkedin.com/in/ "${companyName}" -intitle:${companyName}`;

    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&num=100`;

    console.log(`[google-xray] Query: ${searchQuery}`);
    console.log(`[google-xray] Navigating to Google...`);

    // Increased timeout for slow proxies (60s instead of 30s)
    await page.goto(googleUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // Wait for search results to appear - try multiple conditions
    try {
      await page.waitForSelector("div#search, div#rso, div.g, #main", {
        timeout: 10000,
      });
    } catch (e) {
      console.log(
        "[google-xray] Warning: Main search container not found in 10s",
      );
    }

    await delay(3000, 4000); // Longer delay for JS to render

    // Check for CAPTCHA or unusual traffic message
    const pageText = await page.textContent("body");
    if (
      pageText.includes("unusual traffic") ||
      pageText.includes("CAPTCHA") ||
      pageText.includes("not a robot")
    ) {
      console.error(
        "[google-xray] ⚠️  CAPTCHA detected - this proxy is blocked by Google",
      );

      // Save screenshot for debugging
      const debugPath = `./data/captcha-${Date.now()}.png`;
      try {
        await page.screenshot({ path: debugPath, fullPage: false });
        console.log(`[google-xray] Screenshot saved: ${debugPath}`);
      } catch (e) {
        // Ignore screenshot errors
      }

      // Close browser before retrying
      await browser.close();

      throw new Error("Google CAPTCHA detected - proxy blocked");
    }

    // Debug: Save screenshot if DEBUG=1
    if (process.env.DEBUG) {
      const debugPath = `./data/debug-google-xray-${Date.now()}.png`;
      await page.screenshot({ path: debugPath, fullPage: true });
      console.log(`[google-xray] Debug screenshot saved: ${debugPath}`);
    }

    // Handle Google consent screen (GDPR)
    const consentButton = page
      .locator(
        'button:has-text("Accept all"), button:has-text("I agree"), button:has-text("Reject all")',
      )
      .first();
    if (await consentButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log("[google-xray] Accepting consent...");
      await consentButton.click();
      await delay(2000, 3000);

      // Wait again for results after consent
      await page
        .waitForSelector("div#search, div#rso", { timeout: 10000 })
        .catch(() => {});
      await delay(2000, 3000);
    }

    // Extract search results
    const { employees, debug } = await page.evaluate((companyNameInner) => {
      const results = [];
      const debugInfo = {
        totalContainers: 0,
        linkedInLinksFound: 0,
        companyMentions: 0,
        selectors: [],
        pageInfo: {
          title: document.title,
          hasSearchDiv: !!document.querySelector("#search"),
          hasRsoDiv: !!document.querySelector("#rso"),
          allLinks: document.querySelectorAll("a").length,
          linkedInLinks: document.querySelectorAll('a[href*="linkedin.com"]')
            .length,
        },
      };

      // Try comprehensive list of Google search result selectors
      const selectorPatterns = [
        "div#rso > div", // Modern Google: #rso container
        "div#search div.g", // Classic result container
        "div.Gx5Zad", // Alternative container
        "div[data-sokoban-container]", // Data attribute container
        "[jscontroller][data-hveid]", // JS-controlled elements
        "div.tF2Cxc", // 2024+ Google result class
        "div#search > div > div", // Direct children of search
        "div#rso div[data-hveid]", // Results in #rso with data attr
      ];

      let searchResults = [];

      // Try each selector pattern
      for (const selector of selectorPatterns) {
        const elements = document.querySelectorAll(selector);
        debugInfo.selectors.push({ selector, count: elements.length });

        if (elements.length > 0) {
          searchResults = elements;
          break; // Use first successful selector
        }
      }

      // Fallback: Find all links directly and filter for LinkedIn
      if (searchResults.length === 0) {
        debugInfo.selectors.push({
          selector: 'FALLBACK: All a[href*="linkedin.com/in/"]',
          count: 0,
        });
        const linkedInLinks = document.querySelectorAll(
          'a[href*="linkedin.com/in/"]',
        );

        if (linkedInLinks.length > 0) {
          // Build pseudo-containers around each LinkedIn link
          searchResults = Array.from(linkedInLinks).map((link) => {
            // Walk up the DOM to find the nearest result container
            let parent = link.parentElement;
            let depth = 0;
            while (parent && depth < 10) {
              // Look for a container that likely wraps a full result
              if (parent.querySelector("h3") || parent.offsetHeight > 50) {
                return parent;
              }
              parent = parent.parentElement;
              depth++;
            }
            return link.parentElement || link;
          });

          debugInfo.selectors[debugInfo.selectors.length - 1].count =
            linkedInLinks.length;
        }
      }

      debugInfo.totalContainers = searchResults.length;

      searchResults.forEach((result, index) => {
        try {
          // Extract profile URL
          const linkEl = result.querySelector('a[href*="linkedin.com/in/"]');
          if (!linkEl) return;

          debugInfo.linkedInLinksFound++;

          const profileUrl = linkEl.href;

          // Extract name from the link text or title
          const titleEl = result.querySelector("h3");
          const rawTitle = titleEl?.textContent?.trim() || "";

          // LinkedIn profiles often show as "Name - Title | LinkedIn" or "Name | LinkedIn"
          const namePart = rawTitle
            .replace(/\s*\|\s*LinkedIn.*$/i, "") // Remove " | LinkedIn" suffix
            .replace(/\s*-\s*LinkedIn.*$/i, "") // Remove " - LinkedIn" suffix
            .replace(/\s*\|.*$/i, "") // Remove any remaining pipes
            .split("-")[0] // Take part before dash
            .split("–")[0] // Try en-dash too
            .trim();

          // Extract snippet (description text) - try multiple selectors
          let snippetEl =
            result.querySelector("div[data-sncf]") ||
            result.querySelector("div.VwiC3b") ||
            result.querySelector("span.aCOpRe") ||
            result.querySelector("div.IsZvec") ||
            result.querySelector(".LEwnzc") ||
            result.querySelector("[data-content-feature]");

          const snippet = snippetEl?.textContent?.trim() || "";

          // Try to extract title from snippet or name
          let title = null;

          // Pattern 1: "Name - Title at Company" in title
          const titleMatch = rawTitle.match(
            /^(.+?)\s*[-–]\s*(.+?)(?:\s*[@|at]\s*.+)?$/,
          );
          if (
            titleMatch &&
            titleMatch[2] &&
            !titleMatch[2].includes("LinkedIn")
          ) {
            title = titleMatch[2].trim();
          }

          // Pattern 2: "Title at Company" in snippet
          if (!title) {
            const snippetTitleMatch = snippet.match(/^(.+?)\s+(?:at|@)\s+/i);
            if (snippetTitleMatch) {
              title = snippetTitleMatch[1].trim();
            }
          }

          // Pattern 3: First line of snippet before company mention
          if (!title) {
            const lines = snippet.split(/[.•·|]/);
            if (lines.length > 0) {
              const firstLine = lines[0].trim();
              // Skip if it looks like a sentence or is too long
              if (
                firstLine.length < 60 &&
                !firstLine.match(/^(Experience|About|View)/i)
              ) {
                title = firstLine;
              }
            }
          }

          // Only include results that mentioned the company
          const mentionsCompany =
            snippet.toLowerCase().includes(companyNameInner.toLowerCase()) ||
            rawTitle.toLowerCase().includes(companyNameInner.toLowerCase());

          if (!mentionsCompany) return;

          debugInfo.companyMentions++;

          if (namePart && profileUrl) {
            results.push({
              name: namePart,
              title: title || null,
              profileUrl: profileUrl,
              snippet: snippet.length > 0 ? snippet.substring(0, 200) : null,
            });
          }
        } catch (err) {
          // Silently skip parsing errors in browser context
        }
      });

      return { employees: results, debug: debugInfo };
    }, companyName);

    console.log(
      `[google-xray] Found ${employees.length} employees from Google search`,
    );

    if (process.env.DEBUG) {
      console.log("[google-xray] DEBUG Info:", JSON.stringify(debug, null, 2));

      if (debug.pageInfo.linkedInLinks > 0 && employees.length === 0) {
        console.log(
          `[google-xray] Found ${debug.pageInfo.linkedInLinks} LinkedIn links but none matched "${companyName}"`,
        );
        console.log("[google-xray] This might mean:");
        console.log("  - The search results don't mention the company name");
        console.log("  - Try searching with a shorter company name");
        console.log(`  - Try: --xray "GitHub Inc" or --xray "GitHub, Inc."`);
      }
    }

    if (employees.length === 0) {
      console.log("[google-xray] ⚠️  No results found. Possible reasons:");
      console.log("  1. Google CAPTCHA (check screenshot)");
      console.log("  2. No employees listed for this company on Google");
      console.log("  3. Company name spelling (try variations)");
      console.log("  4. Google rate limit - wait and try again");
      console.log(
        "  5. Use direct LinkedIn scraping instead (--company <url>)",
      );
    }

    // Deduplicate by profile URL
    const uniqueEmployees = Array.from(
      new Map(employees.map((emp) => [emp.profileUrl, emp])).values(),
    );

    // Apply limit
    const limitedEmployees = uniqueEmployees.slice(0, limit);

    console.log(
      `[google-xray] Returning ${limitedEmployees.length} unique employees (limit: ${limit})`,
    );

    return {
      employees: limitedEmployees,
      meta: {
        source: "google-xray-search",
        searchQuery: searchQuery,
        companyName: companyName,
        totalFound: uniqueEmployees.length,
        returned: limitedEmployees.length,
        scrapedAt: new Date().toISOString(),
        note: "Data extracted from Google search results - limited to publicly visible information",
      },
    };
  } finally {
    await browser.close();
  }
}

/**
 * Alternative approach: Use SerpApi (paid service) for more reliable results.
 * Uncomment and use this if you have a SerpApi key.
 *
 * @param {string} companyName
 * @param {object} options
 * @returns {Promise<{employees: object[], meta: object}>}
 */
/*
import { GoogleSearchAPI } from "serpapi";

export async function scrapeCompanyViaSerpApi(companyName, options = {}) {
  const { limit = 50 } = options;
  const api = new GoogleSearchAPI(process.env.SERPAPI_KEY);
  
  const searchQuery = `site:linkedin.com/in/ "${companyName}"`;
  
  const results = await api.search({
    q: searchQuery,
    num: 100,
  });
  
  const employees = results.organic_results
    .filter(r => r.link && r.link.includes('linkedin.com/in/'))
    .map(r => ({
      name: extractName(r.title),
      title: extractTitle(r.snippet),
      profileUrl: r.link,
      snippet: r.snippet,
    }))
    .slice(0, limit);
  
  return {
    employees,
    meta: {
      source: "serpapi",
      companyName,
      totalFound: employees.length,
      scrapedAt: new Date().toISOString(),
    },
  };
}
*/
