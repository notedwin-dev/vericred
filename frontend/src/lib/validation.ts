const USERNAME_RE = /^[a-z0-9_-]+$/;

export function isValidUsername(username: string): boolean {
  return username.length >= 3 && username.length <= 32 && USERNAME_RE.test(username);
}

/**
 * Soft anti-fraud signal for institution registration (VeriCred docs/prds/
 * institution-registration-prd.md Decision 4a) — not a security boundary.
 * Admin approval is the actual authority; a blocklisted domain can still be
 * approved at the admin's discretion, and a domain missing from this list
 * isn't proof of legitimacy either.
 */
const FREEMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "mail.com",
  "gmx.com",
  "yandex.com",
  "zoho.com",
]);

export function isFreemailDomain(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return domain ? FREEMAIL_DOMAINS.has(domain) : false;
}
