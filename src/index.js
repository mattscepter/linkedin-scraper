#!/usr/bin/env node
import "dotenv/config";
import { program } from "commander";
import { runCompanyScrape } from "./commands/scrapeCompany.js";
import { runProfileScrape } from "./commands/scrapeProfile.js";

program
  .name("linkedin-scraper")
  .description("LinkedIn Company & Profile Data Scraper")
  .version("1.0.0");

program
  .option("-c, --company <url>", "Scrape employees from a LinkedIn company URL")
  .option("-p, --profile <url>", "Scrape data from a LinkedIn profile URL")
  .option("-o, --output <path>", "Output file path (without extension)")
  .option(
    "-l, --limit <number>",
    "Max employees to collect (company mode)",
    parseInt,
  )
  .option(
    "-d, --domain <domain>",
    "Company domain for email pattern inference (e.g. github.com)",
  )
  .option("--csv", "Also export results as CSV");

program.parse(process.argv);

const opts = program.opts();

// Validate that exactly one mode is specified
if (!opts.company && !opts.profile) {
  console.error(
    "\nError: Provide either --company <url> or --profile <url>\n\n" +
      "Examples:\n" +
      "  npm start -- --company https://www.linkedin.com/company/github/\n" +
      "  npm start -- --profile https://www.linkedin.com/in/example-user/\n",
  );
  process.exit(1);
}

if (opts.company && opts.profile) {
  console.error(
    "\nError: Use --company OR --profile, not both in a single run.\n",
  );
  process.exit(1);
}

// ── Run ───────────────────────────────────────────────────────────────────

(async () => {
  try {
    if (opts.company) {
      await runCompanyScrape(opts.company, {
        limit: opts.limit,
        output: opts.output,
        csv: opts.csv,
        domain: opts.domain,
      });
    } else {
      await runProfileScrape(opts.profile, {
        output: opts.output,
        csv: opts.csv,
      });
    }
  } catch (err) {
    console.error("\n[error]", err.message);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
})();
