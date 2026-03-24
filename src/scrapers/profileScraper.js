import { createBrowser } from "./browser.js";
import { delay } from "../utils/delay.js";
import { parseConnections } from "../utils/normalize.js";
import defaults from "../../config/defaults.js";

/**
 * Scrapes public profile data for a given LinkedIn profile URL.
 *
 * Strategy:
 *  1. Extract basic header info (name, headline, location, connections, about)
 *     from the main profile page DOM.
 *  2. Visit detail sub-pages (/details/experience/, /details/education/, etc.)
 *     to get complete, un-truncated lists of experience, education, skills,
 *     and projects.
 *
 * @param {string} profileUrl - e.g. https://www.linkedin.com/in/example-user/
 * @returns {Promise<object>} Structured profile JSON
 */
export async function scrapeProfile(profileUrl) {
  console.log(`[profile] Navigating to: ${profileUrl}`);
  const { browser, page } = await createBrowser();

  // Extract the public identifier (slug) from the URL
  const username = profileUrl.match(/\/in\/([^/?#]+)/)?.[1] ?? "";

  try {
    // ── 1. Warm up session, then navigate to profile ─────────────────────
    // Navigating directly to a profile URL can trigger a redirect loop if the
    // cookie hasn't been applied yet. We land on the LinkedIn homepage first
    // to establish the session in the browser context, then navigate to the
    // profile. This eliminates ERR_TOO_MANY_REDIRECTS.
    console.log("[profile] Warming up session on linkedin.com…");
    // 'commit' fires as soon as the first response bytes arrive — much faster
    // than 'domcontentloaded' on a heavy SPA like LinkedIn.
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

    // Wait for the feed/home page to show something meaningful
    await page.waitForSelector("body", { timeout: 20000 }).catch(() => {});
    await delay(800, 1200);

    // Check we are actually logged in (not on the login/authwall page)
    const currentUrl = page.url();
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
    console.log("[profile] Session active. Navigating to profile…");

    // Navigate to the profile — 'commit' + explicit h1 wait is far more reliable
    // than waiting for the full DOM on a React-rendered page
    await page.goto(profileUrl, { waitUntil: "commit", timeout: 60000 });

    await page
      .waitForSelector("h1", { timeout: 15000 })
      .catch(() =>
        console.warn(
          "[profile] h1 not visible within 15s — extracting whatever is available",
        ),
      );

    // ── 3. Scroll to trigger lazy-loaded sections ──────────────────────
    // LinkedIn only renders experience / education / skills / about when the
    // user scrolls to them. A single scroll-to-bottom misses sections that
    // load mid-page. We scroll incrementally with minimal pauses.
    await scrollProfile(page);

    // Wait for the experience section to be in the DOM before extracting.
    // This is the deepest section — if it's present, everything above it is too.
    // Use a broad selector since LinkedIn wraps anchors inside divs, not <section> tags.
    await page
      .waitForSelector(
        '#experience, #experience-section, section[data-section="experience"], .artdeco-card h2',
        { timeout: 10000 },
      )
      .catch(() =>
        console.warn(
          "[profile] Experience section not found — profile may have no experience or sections are hidden",
        ),
      );

    // ── 4. DOM extraction (basic header data) ───────────────────
    const domData = await extractFromDom(page);

    // ── 5. Scrape complete data from detail sub-pages ─────────────────────
    // LinkedIn truncates experience / education / skills on the main profile
    // and hides the rest behind "Show all" buttons that open dedicated pages.
    // We visit those pages while the session is warm to get the full lists.
    const detailData = await scrapeDetailPages(page, profileUrl);

    // ── 6. Merge: detail-page DOM > main-page DOM ────────────────────────
    const profile = {
      name: domData.name,
      headline: domData.headline,
      location: domData.location,
      profileUrl: normalizeUrl(profileUrl),
      connections: parseConnections(domData.connections),
      about: domData.about,
      experience: detailData.experience,
      education: detailData.education,
      skills: detailData.skills,
      projects: detailData.projects,
      scrapedAt: new Date().toISOString(),
    };

    // Save a screenshot if DEBUG=1 is set
    if (process.env.DEBUG) {
      const screenshotPath = `./data/debug-${username}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`[debug] Screenshot: ${screenshotPath}`);
    }

    console.log(
      `[profile] Done. Extracted profile for: ${profile.name ?? profileUrl}`,
    );
    return profile;
  } finally {
    await browser.close();
  }
}

// ── DOM Extractor ───────────────────────────────────────────────────────────

/**
 * Extracts profile data via CSS selectors.
 * Uses broad, multi-selector strategies to survive LinkedIn UI changes.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<object>}
 */
async function extractFromDom(page) {
  return page.evaluate(() => {
    // Try selectors in order, return first match
    function first(...selectors) {
      for (const sel of selectors) {
        const t = document
          .querySelector(sel)
          ?.textContent?.replace(/\s+/g, " ")
          .trim();
        if (t) return t;
      }
      return null;
    }

    // ── Name ─────────────────────────────────────────────────────────────
    // LinkedIn always uses h1 for the name — class changes, tag doesn't
    const name =
      document.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() ||
      null;

    // ── Headline ─────────────────────────────────────────────────────────
    const headline = first(
      ".text-body-medium.break-words",
      ".pv-text-details__left-panel .text-body-medium",
      ".ph5 .mt2 .text-body-medium",
    );

    // ── Location ─────────────────────────────────────────────────────────
    const location = first(
      ".text-body-small.inline.t-black--light.break-words",
      ".pv-text-details__left-panel span.t-black--light",
      ".ph5 span.t-black--light",
    );

    // ── Connections ───────────────────────────────────────────────────────
    // LinkedIn renders connections as "X connections" inside a link near the top card.
    const connEl =
      document.querySelector('a[href*="connections"] span') ||
      document.querySelector(".pv-header__connections span") ||
      Array.from(document.querySelectorAll('a[href*="connections"]')).find(
        (el) => /\d/.test(el.textContent),
      ) ||
      Array.from(document.querySelectorAll("span, li")).find((el) =>
        /\d[\d,+]*\s*connection/i.test(el.textContent?.trim()),
      );
    const connections =
      connEl?.textContent?.replace(/\s+/g, " ").trim() || null;

    // ── About ─────────────────────────────────────────────────────────────
    // LinkedIn wraps the about anchor (#about) inside a div, not a <section>,
    // so we must also try closest('[class*="artdeco-card"]') as fallback.
    const aboutAnchor = document.querySelector("#about");
    const aboutSection =
      aboutAnchor?.closest("section") ||
      aboutAnchor?.closest(
        '[class*="artdeco-card"], [class*="pv-profile-card"]',
      ) ||
      document.querySelector('section[data-section="summary"]') ||
      // heading text fallback
      Array.from(document.querySelectorAll("h2"))
        .find((h) => h.textContent?.trim().toLowerCase() === "about")
        ?.closest('section, [class*="artdeco-card"]');

    const about = aboutSection
      ? Array.from(aboutSection.querySelectorAll('span[aria-hidden="true"]'))
          .map((s) => s.textContent?.replace(/\s+/g, " ").trim())
          .find((t) => t && t.length > 30) ||
        aboutSection
          .querySelector(".pv-about__summary-text, .pv-about-section p")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ||
        null
      : null;

    return {
      name,
      headline,
      location,
      connections,
      about,
    };
  });
}

// ── Detail Page Scraper ─────────────────────────────────────────────────────

/**
 * Visits the /details/* sub-pages for a LinkedIn profile which hold the
 * complete, un-truncated lists that LinkedIn hides behind "Show all" buttons
 * on the main profile page.
 *
 * @param {import('playwright').Page} page  Already-warmed-up page instance
 * @param {string} baseProfileUrl            e.g. https://www.linkedin.com/in/utkarsh2510/
 * @returns {Promise<{experience: object[], education: object[], skills: string[], projects: object[]}>}
 */
async function scrapeDetailPages(page, baseProfileUrl) {
  const base = baseProfileUrl.replace(/\/$/, "");
  const result = { experience: [], education: [], skills: [], projects: [] };

  const targets = [
    { key: "experience", url: `${base}/details/experience/` },
    { key: "education", url: `${base}/details/education/` },
    { key: "skills", url: `${base}/details/skills/` },
    { key: "projects", url: `${base}/details/projects/` },
  ];

  for (const { key, url } of targets) {
    console.log(`[profile] Detail page → ${key}`);
    try {
      await page.goto(url, { waitUntil: "commit", timeout: 30_000 });

      // Wait for at least one list item
      await page
        .waitForSelector("li.artdeco-list__item, ul.pvs-list > li, main li", {
          timeout: 8_000,
        })
        .catch(() =>
          console.warn(`[profile] No list items found on ${key} detail page`),
        );

      // Detail pages load all content immediately, no scrolling needed
      await delay(200, 400);

      result[key] = await page.evaluate((sectionType) => {
        // ── Shared helpers (self-contained for evaluate isolation) ─────────
        function spansFrom(item) {
          return Array.from(item.querySelectorAll('span[aria-hidden="true"]'))
            .map((s) => s.textContent?.replace(/\s+/g, " ").trim())
            .filter(Boolean);
        }
        function splitBullet(raw) {
          return raw ? raw.split(" · ").map((s) => s.trim()) : [];
        }
        function parseDateRange(raw) {
          if (!raw) return { startDate: null, endDate: null };
          const parts = raw.split(" - ");
          return {
            startDate: parts[0]?.trim() || null,
            endDate: parts[1]?.trim() || null,
          };
        }

        // Find the primary top-level <ul> that holds the section items.
        // Detail pages render one <ul class="pvs-list"> inside <main>.
        function getTopList() {
          const byClass = document.querySelector(
            "main ul.pvs-list, main ul[class*='pvs-list']," +
              " .scaffold-layout__main ul.pvs-list," +
              " .scaffold-layout__main ul[class*='pvs-list']",
          );
          if (byClass) return byClass;
          // Fallback: largest <ul> inside <main>
          const allUls = Array.from(
            document.querySelectorAll("main ul, .scaffold-layout__main ul"),
          );
          return allUls.reduce((best, ul) => {
            const cnt = ul.querySelectorAll(":scope > li").length;
            return cnt >
              (best ? best.querySelectorAll(":scope > li").length : 0)
              ? ul
              : best;
          }, null);
        }

        const topList = getTopList();
        if (!topList) return [];

        const topItems = Array.from(
          topList.querySelectorAll(":scope > li"),
        ).filter((li) => spansFrom(li).length > 0);

        // ── Skills ──────────────────────────────────────────────────────
        if (sectionType === "skills") {
          return topItems
            .map((li) => spansFrom(li)[0] || null)
            .filter((s) => s && s.length < 100);
        }

        // ── Education ───────────────────────────────────────────────────
        if (sectionType === "education") {
          return topItems
            .map((li) => {
              const spans = spansFrom(li);
              if (!spans.length) return null;
              return {
                school: spans[0] || null,
                degree: spans[1] || null,
                field: spans[2] || null,
                startDate: spans[3] || null,
                endDate: spans[4] || null,
                logo: li.querySelector("img")?.src || null,
              };
            })
            .filter((e) => e?.school);
        }

        // ── Projects ────────────────────────────────────────────────────
        if (sectionType === "projects") {
          return topItems
            .map((li) => {
              const spans = spansFrom(li);
              if (!spans.length) return null;
              // [0] Name  [1] Date / contributors line  [2+] Description
              return {
                name: spans[0] || null,
                dateRange: spans[1] || null,
                description: spans.slice(2).join(" ") || null,
              };
            })
            .filter((p) => p?.name);
        }

        // ── Experience (multi-role + single-role) ────────────────────────
        const experience = [];

        for (const item of topItems) {
          // ── Detect multi-role (Case B) ────────────────────────────────────
          // LinkedIn's nested <li> elements may or may not carry
          // "artdeco-list__item", so we progressively broaden the search.
          let nestedRoles = item.querySelectorAll("ul > li.artdeco-list__item");

          if (!nestedRoles.length) {
            // LinkedIn nests roles inside scaffold-finite-scroll__content > ul > li
            // Query the scroll content div first, then its UL, then the LI children
            const scrollContentDiv = item.querySelector(
              ".scaffold-finite-scroll__content",
            );

            if (scrollContentDiv) {
              const rolesUl = scrollContentDiv.querySelector("ul");
              if (rolesUl) {
                const candidates = Array.from(
                  rolesUl.querySelectorAll(":scope > li"),
                );

                const validRoles = candidates.filter(
                  (li) => spansFrom(li).length >= 2,
                );
                if (validRoles.length > 0) {
                  nestedRoles = validRoles;
                }
              }
            }

            // Fallback: Try any <li> inside any nested <ul> that has span content
            // LinkedIn may put each role in a separate UL, so collect from ALL ULs
            if (!nestedRoles.length) {
              const innerUls = item.querySelectorAll("ul");

              const allNestedRoles = [];
              for (const ul of innerUls) {
                const candidates = ul.querySelectorAll(":scope > li");

                // A "roles" list will have items with at least 2 spans (title + detail)
                for (const candidate of candidates) {
                  if (spansFrom(candidate).length >= 2) {
                    allNestedRoles.push(candidate);
                  }
                }
              }

              if (allNestedRoles.length > 0) {
                nestedRoles = allNestedRoles;
              }
            }
          }

          if (nestedRoles.length > 0) {
            // ── Case B: multiple roles at same company ──────────────────────
            // Company name + total tenure are in the parent item's own spans.
            // Exclude any spans that live inside the nested roles <ul> so we
            // only read the company header spans.
            const nestedUl = item.querySelector("ul");
            const parentSpans = Array.from(
              item.querySelectorAll("span[aria-hidden='true']"),
            )
              .filter((s) => !nestedUl || !nestedUl.contains(s))
              .map((s) => s.textContent?.replace(/\s+/g, " ").trim())
              .filter(Boolean);

            const companyName = parentSpans[0] || null;
            const totalTenure = parentSpans[1] || null;
            const companyLogo = item.querySelector("img")?.src || null;

            for (const role of nestedRoles) {
              const spans = spansFrom(role);
              if (!spans.length) continue;

              // [0] Title  [1] EmpType  [2] DateRange · Duration  [3] Loc · WorkType
              const locParts = splitBullet(spans[3] || null);
              const dateRangeParts = splitBullet(spans[2] || null);
              const { startDate, endDate } = parseDateRange(
                dateRangeParts[0] || null,
              );
              const workType =
                locParts[1] ||
                (locParts[0] &&
                ["On-site", "Remote", "Hybrid"].includes(locParts[0])
                  ? locParts[0]
                  : null) ||
                null;

              experience.push({
                company: companyName,
                companyLogo: companyLogo,
                title: spans[0] || null,
                employmentType: spans[1] || null,
                startDate,
                endDate,
                duration: dateRangeParts[1] || null,
                totalTenure,
                location: !["On-site", "Remote", "Hybrid"].includes(locParts[0])
                  ? locParts[0]
                  : null,
                workType,
              });
            }
          } else {
            // ── Case A: single role at a company ────────────────────────────
            const spans = spansFrom(item);
            if (!spans.length) continue;

            // [0] Title  [1] Company · EmpType  [2] DateRange · Duration  [3] Loc · WorkType
            const companyParts = splitBullet(spans[1] || null);
            const dateParts = splitBullet(spans[2] || null);
            const locParts = splitBullet(spans[3] || null);
            const { startDate, endDate } = parseDateRange(dateParts[0] || null);
            const workType =
              locParts[1] ||
              (locParts[0] &&
              ["On-site", "Remote", "Hybrid"].includes(locParts[0])
                ? locParts[0]
                : null) ||
              null;

            experience.push({
              company: companyParts[0] || null,
              companyLogo: item.querySelector("img")?.src || null,
              title: spans[0] || null,
              employmentType: companyParts[1] || null,
              startDate,
              endDate,
              duration: dateParts[1] || null,
              totalTenure: null,
              location: !["On-site", "Remote", "Hybrid"].includes(locParts[0])
                ? locParts[0]
                : null,
              workType,
            });
          }
        }
        return experience;
      }, key);

      console.log(`[profile] Detail page ${key}: ${result[key].length} items`);
    } catch (err) {
      console.warn(
        `[profile] Could not scrape ${key} detail page: ${err.message}`,
      );
    }
  }

  return result;
}

// ── Profile Scroller ────────────────────────────────────────────────────────

/**
 * Scrolls the profile page incrementally from top to bottom in 600px steps.
 * Each step pauses briefly so React can render the newly visible sections.
 * LinkedIn lazy-loads experience / education / skills / about only when the
 * user scrolls to them — a single jump to the bottom is not enough.
 *
 * @param {import('playwright').Page} page
 */
async function scrollProfile(page) {
  // Re-evaluate the page height on every step because LinkedIn lazy-loads
  // content as you scroll — the page grows taller with each new section.
  // Optimized: faster scrolling with reduced delays
  const stepPx = 600;
  const stepMs = 180; // Reduced from 550ms - much faster
  const maxSteps = 25; // Reduced from 50 - sufficient for most profiles

  for (let i = 0; i < maxSteps; i++) {
    const { scrollY, totalHeight } = await page.evaluate(() => ({
      scrollY: window.pageYOffset,
      totalHeight: document.body.scrollHeight,
    }));

    // Reached the bottom
    if (scrollY + stepPx >= totalHeight) break;

    await page.evaluate(
      (y) => window.scrollTo({ top: y, behavior: "smooth" }),
      scrollY + stepPx,
    );
    await new Promise((r) => setTimeout(r, stepMs));
  }

  // Scroll back to top so "about" / connections near the top card are rendered
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await new Promise((r) => setTimeout(r, 300)); // Reduced from 800ms
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns a clean, canonical LinkedIn profile URL.
 *
 * @param {string} url
 * @returns {string}
 */
function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return `${defaults.linkedinBase}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}
