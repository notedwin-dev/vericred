import { randomBytes } from "crypto";

/**
 * Generates a credential ID in the `VC-YYYY-SUFFIX` format expected by the
 * certificates API routes (validated against `/^VC-\d{4}-[A-Z0-9]{4,12}$/`).
 * The suffix is derived from cryptographically random bytes, base36-encoded
 * and upper-cased, so collisions are effectively impossible in practice.
 */
export function generateCredentialId(): string {
  const year = new Date().getFullYear();
  const suffix = randomBytes(8).toString("base64url").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12);
  return `VC-${year}-${suffix}`;
}
