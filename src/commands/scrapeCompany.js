import { scrapeCompany } from "../scrapers/companyScraper.js";
import { writeJson } from "../output/jsonWriter.js";
import { writeCsv } from "../output/csvWriter.js";
import path from "path";
import defaults from "../../config/defaults.js";

/**
 * Orchestrates a full company scrape run.
 * Validates the URL, runs the scraper, and writes output files.
 *
 * @param {string} url              - LinkedIn company URL
 * @param {object} [opts]
 * @param {number} [opts.limit]     - Max employees to collect
 * @param {string} [opts.output]    - Output file path (without extension)
 * @param {boolean} [opts.csv]      - Also write CSV output
 * @param {string} [opts.domain]    - Company domain for email inference
 */
export async function runCompanyScrape(url, opts = {}) {
  if (!url.includes("linkedin.com/company/")) {
    throw new Error(
      `Invalid company URL: "${url}"\nExpected format: https://www.linkedin.com/company/<slug>/`,
    );
  }

  console.log(`\n[company] Starting scrape for: ${url}`);
  if (opts.limit) console.log(`[company] Employee limit: ${opts.limit}`);

  const result = await scrapeCompany(url, {
    maxEmployees: opts.limit ?? defaults.maxEmployees,
    companyDomain: opts.domain ?? null,
  });

  // Determine output path
  const slug = extractSlug(url);
  const outputBase =
    opts.output ?? path.join(defaults.outputDir, `company-${slug}`);

  // Write JSON (always)
  const jsonPath = await writeJson(result, outputBase);
  console.log(`\n[output] JSON saved: ${jsonPath}`);

  // Write CSV (optional flag)
  if (opts.csv && result.employees.length > 0) {
    const csvPath = await writeCsv(result.employees, outputBase);
    console.log(`[output] CSV saved:  ${csvPath}`);
  }

  // Print summary table to console
  printSummary(result.employees, url);

  return result;
}

function extractSlug(url) {
  return url.match(/company\/([^/?#]+)/)?.[1] ?? "unknown";
}

function printSummary(employees, url) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Company: ${url}`);
  console.log(`Employees found: ${employees.length}`);
  console.log("─".repeat(60));

  // Show first 5 as a quick preview
  const preview = employees.slice(0, 5);
  for (const e of preview) {
    console.log(`  ${e.name ?? "(unknown)"} — ${e.title ?? "(no title)"}`);
  }
  if (employees.length > 5) {
    console.log(`  … and ${employees.length - 5} more`);
  }
  console.log("─".repeat(60) + "\n");
}
