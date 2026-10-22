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

    // Navigate to the profile — wait for load event
    await page.goto(profileUrl, { waitUntil: "load", timeout: 60000 });
    console.log("[profile] Page loaded, waiting for page to be interactive…");

    // Wait for body and basic structure
    await page.waitForSelector('body', { timeout: 10000 });
    
    // Additional delay for initial React hydration
    await delay(3000, 4000);
    
    console.log("[profile] Page should be interactive now.");
    
    // Debug: Check what's actually on the page
    const pageInfo = await page.evaluate(() => {
      const h1s = document.querySelectorAll('h1');
      const sections = document.querySelectorAll('section');
      const mains = document.querySelectorAll('main');
      const body = document.body;
      
      return {
        url: window.location.href,
        title: document.title,
        bodyHeight: body.scrollHeight,
        h1Count: h1s.length,
        h1Texts: Array.from(h1s).map(h => h.textContent.trim().substring(0, 50)),
        sectionCount: sections.length,
        mainCount: mains.length,
        hasProfileCard: !!document.querySelector('.pv-top-card'),
        hasScaffold: !!document.querySelector('.scaffold-layout'),
      };
    });
    console.log('[profile] Page state:', JSON.stringify(pageInfo, null, 2));
    
    // If no content loaded, wait longer and check again
    if (pageInfo.h1Count === 0 && !pageInfo.hasProfileCard) {
      console.log('[profile] ⚠️  No profile content detected. Waiting 10 more seconds...');
      await delay(10000, 11000);
      
      const pageInfo2 = await page.evaluate(() => {
        const h1s = document.querySelectorAll('h1');
        return {
          bodyHeight: document.body.scrollHeight,
          h1Count: h1s.length,
          h1Texts: Array.from(h1s).map(h => h.textContent.trim().substring(0, 50)),
          hasProfileCard: !!document.querySelector('.pv-top-card'),
        };
      });
      console.log('[profile] After waiting:', JSON.stringify(pageInfo2, null, 2));
      
      if (pageInfo2.h1Count === 0) {
        console.log('\n═══════════════════════════════════════════════════════');
        console.log('⚠️  PROFILE CONTENT NOT LOADING');
        console.log('═══════════════════════════════════════════════════════');
        console.log('LinkedIn may be blocking automation.');
        console.log('Check the browser window - do you see the full profile?');
        console.log('If yes, take a screenshot and inspect the HTML in DevTools.');
        console.log('═══════════════════════════════════════════════════════\n');
        
        // Keep browser open for manual inspection
        console.log('[profile] Keeping browser open for 30 seconds for manual inspection...');
        await delay(30000, 30000);
      }
    }

    // ── 3. Scroll to trigger lazy-loaded sections ──────────────────────
    // LinkedIn only renders experience / education / skills / about when the
    // user scrolls to them. A single scroll-to-bottom misses sections that
    // load mid-page. We scroll incrementally with minimal pauses.
    await scrollProfile(page);
    
    // Wait after scrolling for lazy-loaded content to appear
    console.log("[profile] Waiting for lazy-loaded sections...");
    await delay(4000, 5000);

    // Wait for the experience section to be in the DOM before extracting.
    // This is the deepest section — if it's present, everything above it is too.
    // Use a broad selector since LinkedIn wraps anchors inside divs, not <section> tags.
    await page
      .waitForSelector(
        '#experience, #experience-section, section[data-section="experience"], .artdeco-card h2, section',
        { timeout: 15000 },
      )
      .catch(() =>
        console.warn(
          "[profile] Experience section not found — profile may have no experience or sections are hidden",
        ),
      );

    // ── 4. DOM extraction (basic header data) ───────────────────
    console.log("[profile] Extracting DOM data...");
    
    // Debug: Save HTML if in debug mode
    if (process.env.DEBUG) {
      const html = await page.content();
      const fs = await import('fs');
      fs.writeFileSync(`./data/debug-${username}.html`, html);
      console.log(`[debug] HTML saved: ./data/debug-${username}.html`);
    }
    
    const domData = await extractFromDom(page);
    console.log(`[profile] Extracted: name=${domData.name ? 'OK' : 'MISSING'}, headline=${domData.headline ? 'OK' : 'MISSING'}, location=${domData.location ? 'OK' : 'MISSING'}`);

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

    // Debug: Log what we find
    const debug = {
      h1Count: document.querySelectorAll("h1").length,
      mainExists: !!document.querySelector("main"),
      bodyText: document.body?.textContent?.substring(0, 200),
    };
    console.log("[DOM Debug]", debug);

    // ── Name ─────────────────────────────────────────────────────────────
    // LinkedIn always uses h1 for the name — class changes, tag doesn't
    // Try multiple approaches to find the name
    let name = null;
    
    // Approach 1: Standard h1
    const h1Elements = document.querySelectorAll("h1");
    for (const h1 of h1Elements) {
      const text = h1.textContent?.replace(/\s+/g, " ").trim();
      if (text && text.length > 2 && text.length < 100) {
        name = text;
        break;
      }
    }
    
    // Approach 2: Look in specific containers
    if (!name) {
      name = first(
        "main h1",
        ".scaffold-layout__main h1", 
        ".pv-top-card h1",
        '[data-section="topcard"] h1',
        ".pv-text-details__left-panel h1"
      );
    }

    // ── Headline ─────────────────────────────────────────────────────────
    const headline = first(
      ".text-body-medium.break-words",
      ".pv-text-details__left-panel .text-body-medium",
      ".ph5 .mt2 .text-body-medium",
      "main .text-body-medium",
      ".pv-top-card .text-body-medium",
      '[class*="headline"]',
      ".pv-top-card__tagline"
    );

    // ── Location ─────────────────────────────────────────────────────────
    const location = first(
      ".text-body-small.inline.t-black--light.break-words",
      ".pv-text-details__left-panel span.t-black--light",
      ".ph5 span.t-black--light",
      "main .text-body-small.t-black--light",
      ".pv-top-card .text-body-small",
      '[class*="location"]'
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
      document.querySelector('[id*="about"]')?.closest("section, div") ||
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
        aboutSection
          .querySelector("div.inline-show-more-text")
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

      // Wait for at least one list item - use broader selectors
      await page
        .waitForSelector("li.artdeco-list__item, ul.pvs-list > li, main li, ul li", {
          timeout: 10_000,
        })
        .catch(() =>
          console.warn(`[profile] No list items found on ${key} detail page`),
        );

      // Detail pages load all content immediately, but give React some time
      await delay(800, 1200);

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
  console.log('[profile] Starting scroll sequence...');
  
  const stepPx = 600;
  const stepMs = 500;
  const maxSteps = 25;

  for (let i = 0; i < maxSteps; i++) {
    const { scrollY, totalHeight } = await page.evaluate(() => ({
      scrollY: window.pageYOffset,
      totalHeight: document.body.scrollHeight,
    }));

    // Reached the bottom
    if (scrollY + stepPx >= totalHeight) {
      console.log(`[profile] Reached bottom at step ${i + 1}, scrollY=${scrollY}, totalHeight=${totalHeight}`);
      break;
    }

    // Scroll down - use simple scrollBy for reliability
    await page.evaluate((step) => {
      window.scrollBy(0, step);
    }, stepPx);
    
    if (i % 5 === 0) {
      console.log(`[profile] Scroll step ${i + 1}/${maxSteps}, position: ${scrollY}px`);
    }
    
    await new Promise((r) => setTimeout(r, stepMs));
  }

  console.log('[profile] Scrolling back to top...');
  // Scroll back to top so "about" / connections near the top card are rendered
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 1000));
  console.log('[profile] Scroll sequence complete.');
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
