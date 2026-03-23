import "dotenv/config";

/**
 * Reads LinkedIn session cookies from environment variables and returns
 * an array of cookie objects ready for Playwright's context.addCookies().
 *
 * Required:  LINKEDIN_COOKIE  (the li_at session token)
 * Optional:  LINKEDIN_JSESSIONID, LINKEDIN_BCOOKIE, LINKEDIN_LIDC
 *
 * @returns {{ name: string, value: string, domain: string, path: string }[]}
 */
export function loadCookies() {
  const liAt = process.env.LINKEDIN_COOKIE;

  if (!liAt || liAt === "your_li_at_cookie_value_here") {
    throw new Error(
      "LINKEDIN_COOKIE is not set.\n" +
        "Copy your li_at cookie from Chrome DevTools (Application → Cookies → linkedin.com)\n" +
        "and add it to a .env file: LINKEDIN_COOKIE=<value>",
    );
  }

  const base = {
    domain: ".linkedin.com",
    path: "/",
    secure: true,
    httpOnly: true,
  };
  const cookies = [{ ...base, name: "li_at", value: liAt }];

  if (process.env.LINKEDIN_JSESSIONID) {
    cookies.push({
      ...base,
      name: "JSESSIONID",
      value: process.env.LINKEDIN_JSESSIONID,
    });
  }
  if (process.env.LINKEDIN_BCOOKIE) {
    cookies.push({
      ...base,
      name: "bcookie",
      value: process.env.LINKEDIN_BCOOKIE,
    });
  }
  if (process.env.LINKEDIN_LIDC) {
    cookies.push({ ...base, name: "lidc", value: process.env.LINKEDIN_LIDC });
  }

  return cookies;
}
