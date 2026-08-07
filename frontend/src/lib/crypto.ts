import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Magic prefix on every encrypted binary artifact.
 *
 * Gives an artifact-level discriminator that does not depend on any database
 * flag: a plaintext certificate starts with `%PDF`, an encrypted one with
 * `VCE1`. So a wrong or missing `Certificate.encKeyEnc` can never cause us to
 * hand ciphertext to a PDF viewer or plaintext to a decryptor. The trailing
 * digit leaves room to version the format.
 */
const ARTIFACT_MAGIC = Buffer.from("VCE1", "ascii");
const HEADER_LENGTH = ARTIFACT_MAGIC.length + IV_LENGTH + AUTH_TAG_LENGTH;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) throw new Error("ENCRYPTION_KEY is not set");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be 32 bytes (64 hex characters)");
  }
  return key;
}

/**
 * AES-256-GCM encryption for secrets stored at rest, keyed by ENCRYPTION_KEY.
 * Used for per-issuer operator wallet private keys (lib/operator-wallet.ts)
 * and for wrapping per-certificate content keys (lib/generate-certificate.tsx).
 * Output format is `iv:authTag:ciphertext`, all hex — a single opaque string
 * safe to store in a TEXT column.
 *
 * The hex encoding doubles the payload, which is irrelevant for a 66-character
 * private key and unacceptable for a multi-megabyte PDF. Binary artifacts use
 * `encryptBuffer` below instead; this function is UTF-8 only and will corrupt
 * arbitrary bytes.
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), ciphertext.toString("hex")].join(":");
}

export function decrypt(payload: string): string {
  const [ivHex, authTagHex, ciphertextHex] = payload.split(":");
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error("Malformed encrypted payload");
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// ── Binary artifacts (certificate documents) ────────────────────────────────
//
// Separate from the string API above because the ciphertext here is pinned to
// IPFS as an opaque file rather than stored in a TEXT column. It therefore does
// not need to survive as a string, so there is no hex or base64 and no size
// penalty. The content key is per-certificate and random; ENCRYPTION_KEY only
// ever wraps it, via `encrypt` above. See docs/encrypted-certificates.md.

/** A fresh random content key. One per certificate — never reused. */
export function generateContentKey(): Buffer {
  return randomBytes(32);
}

/**
 * Encrypts arbitrary bytes under `key`, returning
 * `[4B magic][12B iv][16B authTag][ciphertext]` — 32 bytes of overhead.
 *
 * `aad` is bound into the authentication tag without being encrypted. Callers
 * pass the credentialId, so an artifact lifted from one certificate and served
 * as another fails to authenticate instead of decrypting cleanly.
 */
export function encryptBuffer(plaintext: Buffer, key: Buffer, aad?: Buffer): Buffer {
  assertContentKey(key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  if (aad) cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([ARTIFACT_MAGIC, iv, cipher.getAuthTag(), ciphertext]);
}

/**
 * Reverses `encryptBuffer`. Throws if the payload is not a VeriCred artifact,
 * or if the key, AAD or bytes have been tampered with — GCM's authentication
 * failure surfaces from `decipher.final()`, and callers must let it propagate
 * rather than serving unverified bytes.
 */
export function decryptBuffer(payload: Buffer, key: Buffer, aad?: Buffer): Buffer {
  assertContentKey(key);
  if (!isEncryptedArtifact(payload)) {
    throw new Error("Not a VeriCred encrypted artifact");
  }

  const ivStart = ARTIFACT_MAGIC.length;
  const tagStart = ivStart + IV_LENGTH;
  const iv = payload.subarray(ivStart, tagStart);
  const authTag = payload.subarray(tagStart, HEADER_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  if (aad) decipher.setAAD(aad);
  return Buffer.concat([decipher.update(payload.subarray(HEADER_LENGTH)), decipher.final()]);
}

/**
 * Whether these bytes carry the artifact magic. Cheap enough to call on
 * anything fetched from a gateway before deciding what to do with it.
 */
export function isEncryptedArtifact(bytes: Buffer): boolean {
  return bytes.length >= HEADER_LENGTH && bytes.subarray(0, ARTIFACT_MAGIC.length).equals(ARTIFACT_MAGIC);
}

function assertContentKey(key: Buffer): void {
  if (key.length !== 32) {
    throw new Error("Content key must be 32 bytes");
  }
}
