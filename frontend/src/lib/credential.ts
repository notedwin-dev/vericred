import { randomBytes } from "crypto";

/**
 * Generates a credential ID in the `VC-YYYY-SUFFIX` format expected by the
 * certificates API routes (validated against `/^VC-\d{4}-[A-Z0-9]{4,12}$/`).
 * The suffix is derived from cryptographically random bytes, base36-encoded
 * and upper-cased, so collisions are effectively impossible in practice.
 */
export function generateCredentialId(): string {
  const year = new Date().getFullYear();
  const suffix = randomBytes(6).toString("hex").toUpperCase().slice(0, 10);
  return `VC-${year}-${suffix}`;
}
