import { createObjectCsvWriter } from "csv-writer";
import path from "path";
import fs from "fs/promises";

/**
 * Writes an array of flat objects to a CSV file.
 * Column headers are derived from the keys of the first record.
 *
 * @param {object[]} records    - Array of flat objects (same keys)
 * @param {string}   outputBase - File path without extension
 * @returns {Promise<string>}   Resolved file path
 */
export async function writeCsv(records, outputBase) {
  if (!records || records.length === 0) {
    throw new Error("[csv] No records to write.");
  }

  const filePath = outputBase.endsWith(".csv")
    ? outputBase
    : `${outputBase}.csv`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  // Build header from keys of the first record
  const header = Object.keys(records[0]).map((key) => ({
    id: key,
    title: key.charAt(0).toUpperCase() + key.slice(1),
  }));

  const csvWriter = createObjectCsvWriter({ path: filePath, header });
  await csvWriter.writeRecords(records);

  return filePath;
}
