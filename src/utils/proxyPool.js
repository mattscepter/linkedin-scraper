/**
 * Proxy Pool Manager - Rotates through a list of proxies
 *
 * Usage:
 * 1. Add proxies to proxies.txt (one per line: host:port)
 * 2. Import and use: getRandomProxy()
 */

import fs from "fs";
import path from "path";

let proxyList = [];
let lastLoadTime = 0;
const CACHE_DURATION = 60000; // Reload proxy list every 60 seconds

/**
 * Load proxies from proxies.txt file
 * Format: IP:PORT (one per line)
 */
function loadProxies() {
  const now = Date.now();

  // Return cached list if recently loaded
  if (proxyList.length > 0 && now - lastLoadTime < CACHE_DURATION) {
    return proxyList;
  }

  try {
    const proxyFilePath = path.join(process.cwd(), "proxies.txt");

    if (!fs.existsSync(proxyFilePath)) {
      console.warn(
        "[proxy] proxies.txt not found - no proxy rotation available",
      );
      return [];
    }

    const content = fs.readFileSync(proxyFilePath, "utf-8");

    proxyList = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")) // Skip empty lines and comments
      .filter((line) => {
        // Support two formats:
        // 1. IP:PORT (e.g., 151.123.176.75:3129)
        // 2. username:password@host:port (e.g., user:pass@proxy.io:60000)
        const isIpPort = /^\d+\.\d+\.\d+\.\d+:\d+$/.test(line);
        const isAuthProxy = /^[^:]+:[^@]+@[^:]+:\d+$/.test(line);
        return isIpPort || isAuthProxy;
      })
      .map((line) => {
        // Don't add protocol prefix - let the scraper handle it
        // Playwright requires HTTP protocol for proxies (even for HTTPS endpoints)
        if (line.startsWith("http://") || line.startsWith("https://")) {
          return line;
        }

        // Always use http:// for proxy protocol (Playwright limitation)
        // The proxy will handle HTTPS tunneling via CONNECT method
        return `http://${line}`;
      });

    lastLoadTime = now;

    console.log(`[proxy] Loaded ${proxyList.length} proxies from proxies.txt`);

    return proxyList;
  } catch (error) {
    console.error("[proxy] Error loading proxies:", error.message);
    return [];
  }
}

/**
 * Get a random proxy from the pool
 * @returns {string|null} Proxy URL (e.g., "http://1.2.3.4:8080") or null if no proxies
 */
export function getRandomProxy() {
  const proxies = loadProxies();

  if (proxies.length === 0) {
    return null;
  }

  const randomIndex = Math.floor(Math.random() * proxies.length);
  return proxies[randomIndex];
}

/**
 * Get all available proxies
 * @returns {string[]} Array of proxy URLs
 */
export function getAllProxies() {
  return loadProxies();
}

/**
 * Get proxy count
 * @returns {number} Number of available proxies
 */
export function getProxyCount() {
  return loadProxies().length;
}

/**
 * Force reload proxy list from file
 */
export function reloadProxies() {
  lastLoadTime = 0;
  proxyList = [];
  return loadProxies();
}
