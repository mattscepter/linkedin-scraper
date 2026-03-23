import { scrapeProfile } from "../scrapers/profileScraper.js";
import { writeJson } from "../output/jsonWriter.js";
import { writeCsv } from "../output/csvWriter.js";
import path from "path";
import defaults from "../../config/defaults.js";

/**
 * Orchestrates a full profile scrape run.
 * Validates the URL, runs the scraper, and writes output files.
 *
 * @param {string} url           - LinkedIn profile URL
 * @param {object} [opts]
 * @param {string} [opts.output] - Output file path (without extension)
 * @param {boolean} [opts.csv]   - Also write CSV output
 */
export async function runProfileScrape(url, opts = {}) {
  if (!url.includes("linkedin.com/in/")) {
    throw new Error(
      `Invalid profile URL: "${url}"\nExpected format: https://www.linkedin.com/in/<username>/`,
    );
  }

  console.log(`\n[profile] Starting scrape for: ${url}`);

  const profile = await scrapeProfile(url);

  // Determine output path
  const username = extractUsername(url);
  const outputBase =
    opts.output ?? path.join(defaults.outputDir, `profile-${username}`);

  // Write JSON (always)
  const jsonPath = await writeJson(profile, outputBase);
  console.log(`\n[output] JSON saved: ${jsonPath}`);

  // Write CSV (optional — profile flattened to single row)
  if (opts.csv) {
    const row = flattenProfile(profile);
    const csvPath = await writeCsv([row], outputBase);
    console.log(`[output] CSV saved:  ${csvPath}`);
  }

  // Print summary
  printSummary(profile);

  return profile;
}

function extractUsername(url) {
  return url.match(/\/in\/([^/?#]+)/)?.[1] ?? "unknown";
}

/**
 * Flattens a rich profile object to a single CSV-friendly row.
 * Arrays are joined with " | " for readability.
 */
function flattenProfile(profile) {
  return {
    name: profile.name ?? "",
    headline: profile.headline ?? "",
    location: profile.location ?? "",
    connections: profile.connections ?? "",
    profileUrl: profile.profileUrl ?? "",
    about: profile.about ?? "",
    experience: (profile.experience ?? [])
      .map((e) => `${e.title} @ ${e.company} (${e.startDate}–${e.endDate})`)
      .join(" | "),
    education: (profile.education ?? [])
      .map((e) => `${e.school}: ${e.degree}`)
      .join(" | "),
    skills: (profile.skills ?? []).join(", "),
  };
}

function printSummary(profile) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Name:        ${profile.name ?? "(unknown)"}`);
  console.log(`Headline:    ${profile.headline ?? "(none)"}`);
  console.log(`Location:    ${profile.location ?? "(none)"}`);
  console.log(`Connections: ${profile.connections ?? "(hidden)"}`);
  console.log(`Experience:  ${profile.experience.length} entries`);
  console.log(`Education:   ${profile.education.length} entries`);
  console.log(`Skills:      ${profile.skills.length} listed`);
  console.log("─".repeat(60) + "\n");
}
