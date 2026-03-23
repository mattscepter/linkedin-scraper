import fs from "fs/promises";
import path from "path";
import defaults from "../../config/defaults.js";

/**
 * Serialises data to a formatted JSON file.
 * Creates the output directory if it does not exist.
 *
 * @param {object} data       - Data to serialise
 * @param {string} outputBase - File path without extension
 * @returns {Promise<string>} Resolved file path
 */
export async function writeJson(data, outputBase) {
  const filePath = outputBase.endsWith(".json")
    ? outputBase
    : `${outputBase}.json`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  return filePath;
}
