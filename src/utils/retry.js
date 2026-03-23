import defaults from "../../config/defaults.js";

/**
 * Wraps an async function with retry logic and exponential backoff.
 * Retries on network errors, timeouts, and HTTP 429/999 responses.
 *
 * @param {Function} fn        - Async function to execute
 * @param {string}   label     - Descriptive label for logging
 * @param {number}   [maxAttempts] - Override default max attempts
 * @returns {Promise<*>} Result of fn()
 */
export async function withRetry(
  fn,
  label = "operation",
  maxAttempts = defaults.retry.maxAttempts,
) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isRateLimit =
        err.message?.includes("429") ||
        err.message?.includes("999") ||
        err.message?.includes("Too Many Requests");

      const backoffMs = defaults.retry.baseBackoffMs * attempt;
      const waitMs = isRateLimit ? backoffMs : Math.min(backoffMs, 10000);

      console.warn(
        `[retry] "${label}" failed (attempt ${attempt}/${maxAttempts}): ${err.message}`,
      );

      if (attempt < maxAttempts) {
        console.warn(`[retry] Waiting ${waitMs / 1000}s before next attempt…`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  throw new Error(
    `[retry] "${label}" exhausted ${maxAttempts} attempts. Last error: ${lastError?.message}`,
  );
}
