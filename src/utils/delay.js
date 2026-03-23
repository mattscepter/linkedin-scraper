import defaults from "../../config/defaults.js";

/**
 * Sleeps for a random duration between min and max milliseconds.
 * Mimics human browsing rhythm to avoid rate-limit triggers.
 *
 * @param {number} [minMs] - Minimum sleep time in ms
 * @param {number} [maxMs] - Maximum sleep time in ms
 * @returns {Promise<void>}
 */
export async function delay(
  minMs = defaults.delay.minMs,
  maxMs = defaults.delay.maxMs,
) {
  const duration = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, duration));
}

/**
 * Short scroll delay — used between individual scroll steps.
 *
 * @returns {Promise<void>}
 */
export async function scrollDelay() {
  return delay(defaults.scrollDelay.minMs, defaults.scrollDelay.maxMs);
}
