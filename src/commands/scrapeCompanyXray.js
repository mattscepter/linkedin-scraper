import { scrapeCompanyViaGoogle } from "../scrapers/googleXrayScraper.js";
import { writeJson } from "../output/jsonWriter.js";
import { writeCsv } from "../output/csvWriter.js";
import path from "path";
import defaults from "../../config/defaults.js";

/**
 * Orchestrates Google X-Ray search for company employees.
 *
 * @param {string} companyName - Company name (e.g. "GitHub", "Rebel Foods")
 * @param {object} options - { limit, outputPath, csv, includeTitle }
 * @returns {Promise<object>} - Scraped data with employees array
 */
export async function runGoogleXrayScrape(companyName, options = {}) {
  const {
    limit = defaults.maxEmployees,
    outputPath,
    csv = false,
    includeTitle = true,
  } = options;

  console.log(`\n🔍 Google X-Ray Search: "${companyName}"\n`);
  console.log(`📊 Settings: limit=${limit}, includeTitle=${includeTitle}\n`);

  // Scrape via Google
  const result = await scrapeCompanyViaGoogle(companyName, {
    limit,
    includeTitle,
  });

  // Generate output file path
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const finalPath = outputPath || path.join(defaults.outputDir, `xray-${slug}`);

  // Write JSON
  const jsonPath = await writeJson(result, finalPath);
  console.log(`\n✅ JSON saved: ${jsonPath}`);

  // Write CSV if requested
  if (csv && result.employees.length > 0) {
    const csvPath = await writeCsv(result.employees, finalPath);
    console.log(`✅ CSV saved: ${csvPath}`);
  }

  console.log(
    `\n📈 Summary: Found ${result.employees.length} employees via Google X-Ray search\n`,
  );
  console.log(
    `⚠️  Note: This method provides limited data compared to direct LinkedIn scraping.`,
  );
  console.log(`   You get: name, title (if available), profile URL`);
  console.log(`   Missing: email patterns, seniority, detailed experience\n`);

  return result;
}
