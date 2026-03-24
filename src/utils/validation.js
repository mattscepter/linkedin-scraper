/**
 * Validates LinkedIn URLs
 */

export function validateLinkedInUrl(url, type = "profile") {
  if (!url || typeof url !== "string") {
    return false;
  }

  try {
    const urlObj = new URL(url);

    if (!urlObj.hostname.includes("linkedin.com")) {
      return false;
    }

    if (type === "profile") {
      return urlObj.pathname.startsWith("/in/");
    } else if (type === "company") {
      return urlObj.pathname.startsWith("/company/");
    }

    return false;
  } catch (error) {
    return false;
  }
}
