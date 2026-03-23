/**
 * Infers a seniority level from a job title string.
 *
 * @param {string|null} title
 * @returns {'intern'|'junior'|'mid'|'senior'|'staff'|'lead'|'manager'|'director'|'vp'|'c-suite'|null}
 */
export function inferSeniority(title) {
  if (!title) return null;
  const t = title.toLowerCase();

  if (/\b(intern|internship|apprentice|trainee)\b/.test(t)) return "intern";
  if (/\b(junior|jr\.?|entry.level|associate)\b/.test(t)) return "junior";
  if (/\b(staff)\b/.test(t)) return "staff";
  if (/\b(senior|sr\.?|snr)\b/.test(t)) return "senior";
  if (/\b(lead|principal|architect)\b/.test(t)) return "lead";
  if (/\b(manager|mgr|head of)\b/.test(t)) return "manager";
  if (/\b(director)\b/.test(t)) return "director";
  if (/\b(vp|vice president)\b/.test(t)) return "vp";
  if (/\b(ceo|cto|cfo|coo|cpo|chief)\b/.test(t)) return "c-suite";
  return "mid";
}

/**
 * Parses a raw connections string into a normalised number or capped string.
 * LinkedIn exposes either an exact count ("32 connections") or a capped
 * value ("500+ connections"). Returns a number when exact, the cap string
 * when capped (e.g. "500+"), and null when not parseable.
 *
 * @param {string|null} raw - e.g. "500+ connections" | "32 connections"
 * @returns {number|string|null}
 */
export function parseConnections(raw) {
  if (!raw) return null;
  // Capped: "500+", "500+ connections"
  const capped = raw.match(/(\d[\d,]*)\+/);
  if (capped) return `${capped[1].replace(/,/g, "")}+`;
  // Exact: "32 connections", "1,234 connections"
  const exact = raw.match(/([\d,]+)/);
  if (exact) return parseInt(exact[1].replace(/,/g, ""), 10);
  return null;
}

/**
 * Generates a likely email pattern for an employee based on company domain.
 * Returns a pattern string, not a verified email.
 *
 * @param {string|null} name         - Full name (e.g. "Jane Doe")
 * @param {string|null} companyDomain - Company domain (e.g. "github.com")
 * @returns {string|null}
 */
export function inferEmailPattern(name, companyDomain) {
  if (!name || !companyDomain) return null;
  const parts = name.toLowerCase().trim().split(/\s+/);
  if (parts.length < 2) return null;
  const [first, ...rest] = parts;
  const last = rest[rest.length - 1];
  // Most common patterns: first.last@domain, firstlast@domain, f.last@domain
  return `${first}.${last}@${companyDomain}`;
}
