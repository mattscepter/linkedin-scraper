import { createBrowser } from "./browser.js";
import { delay, scrollDelay } from "../utils/delay.js";
import { withRetry } from "../utils/retry.js";
import { inferSeniority, inferEmailPattern } from "../utils/normalize.js";
import defaults from "../../config/defaults.js";

/**
 * Scrapes the employees of a LinkedIn company page.
 *
 * Strategy:
 *  1. Navigate to /company/<slug>/people/
 *  2. Scroll and click "Show more results" button to load all employees
 *  3. Parse employee cards from DOM
 *
 * @param {string} companyUrl   - e.g. https://www.linkedin.com/company/github/
 * @param {object} [options]
 * @param {number} [options.maxEmployees] - Override default employee limit
 * @param {string} [options.companyDomain] - Domain for email pattern inference
 * @returns {Promise<{ employees: object[], meta: object }>}
 */
export async function scrapeCompany(companyUrl, options = {}) {
  const maxEmployees = options.maxEmployees ?? defaults.maxEmployees;
  const companyDomain = options.companyDomain ?? null;

  // Normalise URL to /company/<slug>/people/ format
  const peopleUrl =
    companyUrl.replace(/\/?$/, "/").replace(/people\/$/, "") + "people/";
  console.log(`[company] Navigating to: ${peopleUrl}`);

  const { browser, page } = await createBrowser();
  let scrollCount = 0;

  try {
    // Forward browser console logs if DEBUG mode enabled
    if (process.env.DEBUG) {
      page.on("console", (msg) => {
        if (msg.text().includes("[DOM]")) {
          console.log(`  [BROWSER] ${msg.text()}`);
        }
      });
    }

    // ── Warm up session first ─────────────────────────────────────────────
    // Navigating directly to a company people page can trigger redirects if
    // the cookie hasn't been applied yet. We visit /feed/ first to establish
    // the session, then navigate to the company page.
    console.log("[company] Warming up session on linkedin.com…");
    await page
      .goto("https://www.linkedin.com/feed/", {
        waitUntil: "commit",
        timeout: 60000,
      })
      .catch(() =>
        page.goto("https://www.linkedin.com/", {
          waitUntil: "commit",
          timeout: 60000,
        }),
      );

    await page.waitForSelector("body", { timeout: 20000 }).catch(() => {});
    await delay(2000, 3000);

    // Check if we're logged in
    let currentUrl = page.url();
    if (
      currentUrl.includes("/login") ||
      currentUrl.includes("/authwall") ||
      currentUrl.includes("/checkpoint")
    ) {
      throw new Error(
        "LinkedIn cookie is expired or invalid — browser redirected to login page.\n" +
          "Please refresh your li_at cookie:\n" +
          "  Chrome → linkedin.com → DevTools → Application → Cookies → copy li_at → paste into .env",
      );
    }
    console.log("[company] Session active. Navigating to company people page…");

    // Navigate to the people page
    await withRetry(
      () => page.goto(peopleUrl, { waitUntil: "commit", timeout: 60000 }),
      "navigate to company people page",
    );

    await delay(2000, 3000);

    // Double-check we didn't get redirected to login
    currentUrl = page.url();
    if (
      currentUrl.includes("/login") ||
      currentUrl.includes("/authwall") ||
      currentUrl.includes("/checkpoint")
    ) {
      throw new Error(
        "LinkedIn cookie is expired or redirected to login when accessing company page.\n" +
          "Please refresh your li_at cookie.",
      );
    }

    // Wait for at least one card or list element to render before scrolling
    await page
      .waitForSelector(
        '[data-view-name="profile-card"], .org-people-profile-card__profile-info, .scaffold-finite-scroll, ' +
          ".org-people__profile-list, main ul li, .search-results-container",
        { timeout: 25000 },
      )
      .catch(() => {
        console.warn(
          "[company] Card selector not found within 25s — checking page state…",
        );
      });

    // Additional check: is this a restricted access page?
    const accessCheck = await page.evaluate(() => {
      const bodyText = document.body.textContent || "";
      return {
        hasRestriction:
          bodyText.includes("Sales Navigator") ||
          bodyText.includes("Premium") ||
          bodyText.includes("upgrade") ||
          bodyText.includes("You've reached the limit"),
        restrictionSnippet:
          bodyText.match(
            /.{0,100}(Sales Navigator|Premium|upgrade|limit).{0,100}/i,
          )?.[0] || null,
      };
    });

    if (accessCheck.hasRestriction) {
      console.warn(
        `[company] ⚠️  Access restriction detected: ${accessCheck.restrictionSnippet}`,
      );
      console.warn(
        "[company] This may require LinkedIn Premium or Sales Navigator to access all employees.",
      );
    }

    // ── Scroll Loop with "Show more" button handling ──────────────────────
    // Scroll to bottom and click "Show more results" button to load all employees
    // for DOM parsing. We stop when the button disappears or max scrolls reached.
    let noProgressCount = 0;
    const maxScrolls = Math.ceil(maxEmployees / 10) + 5; // safety buffer

    console.log("[company] Starting pagination loop (scroll + button clicks)…");

    while (scrollCount < maxScrolls) {
      // Scroll to bottom
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await scrollDelay();
      scrollCount++;

      // After scrolling, aggressively look for and click "Show more" button
      // The button can have different texts and classes, so we try multiple selectors
      let buttonClicked = false;
      try {
        const buttonSelectors = [
          'button:has-text("Show more results")',
          'button:has-text("Show all results")',
          'button[aria-label*="Show more"]',
          "button.scaffold-finite-scroll__load-button",
          "button[data-test-pagination-page-btn]",
          'button:has-text("Next")',
        ];

        for (const selector of buttonSelectors) {
          try {
            const button = page.locator(selector).first();
            if (await button.isVisible({ timeout: 1000 })) {
              await button.scrollIntoViewIfNeeded();
              await delay(500, 800);
              await button.click();
              console.log("[company] ✓ Clicked 'Show more' button");
              await delay(2000, 3000); // Wait for new batch to load
              buttonClicked = true;
              break;
            }
          } catch {
            // Try next selector
          }
        }
      } catch {
        // No button found
      }

      // Track progress - if no button found/clicked for 3 attempts, we're done
      if (!buttonClicked) {
        noProgressCount++;
      } else {
        noProgressCount = 0; // Reset if we made progress
      }

      process.stdout.write(
        `\r[company] Pagination: scroll ${scrollCount}, button: ${buttonClicked ? "✓" : "-"}…`,
      );

      // Stop if no button found for 3 consecutive attempts
      if (noProgressCount >= 3) {
        console.log(
          "\n[company] No more 'Show more' buttons found — end of list reached.",
        );
        break;
      }
    }
    process.stdout.write("\n");

    // ── Parse DOM ──────────────────────────────────────────────────────────
    // Parse all employee cards from the DOM
    console.log("[company] Parsing employee cards from DOM…");
    let employees = await parseDom(page, companyDomain);

    // Trim to requested limit
    employees = employees.slice(0, maxEmployees);

    console.log(
      `[company] Done. ${employees.length} unique employees collected.`,
    );
    return {
      employees,
      meta: {
        sourceUrl: companyUrl,
        scrapedAt: new Date().toISOString(),
        totalCollected: employees.length,
      },
    };
  } finally {
    await browser.close();
  }
}

// ── DOM Parser ──────────────────────────────────────────────────────────────

/**
 * Parses employee cards from the DOM.
 * LinkedIn renders cards with fairly stable data-view-name attributes.
 *
 * @param {import('playwright').Page} page
 * @param {string|null} companyDomain
 * @returns {Promise<object[]>}
 */
async function parseDom(page, companyDomain) {
  const employees = await page.evaluate((domain) => {
    const cards = Array.from(
      document.querySelectorAll(
        '[data-view-name="profile-card"], ' +
          ".org-people-profile-card__profile-info, " +
          ".member-list__member, " +
          "li.org-people-profile-card__profile-card-spacing, " +
          'li[class*="org-people"], ' +
          "main ul > li",
      ),
    );

    console.log(`[DOM] Found ${cards.length} potential employee cards`);

    const seenUrls = new Set();
    const results = [];

    for (const card of cards) {
      const nameEl = card.querySelector(
        ".text-heading-medium, .artdeco-entity-lockup__title, .member-list__name, " +
          'span[aria-hidden="true"]:first-child, .org-people-profile-card__profile-title',
      );
      const titleEl = card.querySelector(
        ".t-14.t-black--light, .artdeco-entity-lockup__subtitle, .member-list__occupation, " +
          ".text-body-small",
      );
      const linkEl = card.querySelector('a[href*="/in/"]');

      const name = nameEl?.textContent?.replace(/\s+/g, " ").trim() || null;
      const title = titleEl?.textContent?.replace(/\s+/g, " ").trim() || null;
      const profileUrl = linkEl
        ? "https://www.linkedin.com" + new URL(linkEl.href).pathname
        : null;

      // Skip duplicates
      if (profileUrl && seenUrls.has(profileUrl)) {
        continue;
      }

      if (name || profileUrl) {
        if (profileUrl) {
          seenUrls.add(profileUrl);
        }
        console.log(`[DOM] Extracted: ${name} | ${title}`);
        results.push({ name, title, profileUrl });
      }
    }

    return results;
  }, companyDomain);

  // Add seniority and email pattern inference (these functions aren't available in browser context)
  const enrichedEmployees = employees.map((emp) => ({
    ...emp,
    seniority: inferSeniority(emp.title),
    ...(companyDomain && emp.name
      ? { emailPattern: inferEmailPattern(emp.name, companyDomain) }
      : {}),
  }));

  console.log(
    `[company] DOM parser found ${enrichedEmployees.length} employees`,
  );
  return enrichedEmployees;
}
