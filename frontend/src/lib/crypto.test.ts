import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decrypt,
  decryptBuffer,
  encrypt,
  encryptBuffer,
  generateContentKey,
  isEncryptedArtifact,
} from "./crypto";

/**
 * The string API is what `lib/operator-wallet.ts` stores every
 * `Issuer.operatorKeyEnc` with, and those rows are already in the database.
 * Its `iv:authTag:ciphertext` hex format is therefore frozen: change it and
 * existing issuers can no longer decrypt their operator wallet, which silently
 * breaks deferred anchoring. These tests exist to make that breakage loud.
 *
 * Binary support for certificate artifacts is added alongside this API, not in
 * place of it — see docs/encrypted-certificates.md.
 */
describe("crypto — string API (operator wallet keys)", () => {
  const PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

  it("round-trips a private key", () => {
    expect(decrypt(encrypt(PRIVATE_KEY))).toBe(PRIVATE_KEY);
  });

  it("emits iv:authTag:ciphertext as hex, with a 12-byte IV and 16-byte tag", () => {
    const [iv, authTag, ciphertext] = encrypt(PRIVATE_KEY).split(":");

    expect(iv).toMatch(/^[0-9a-f]{24}$/);
    expect(authTag).toMatch(/^[0-9a-f]{32}$/);
    expect(ciphertext).toMatch(/^[0-9a-f]+$/);
  });

  it("produces different ciphertext each time, from the random IV", () => {
    expect(encrypt(PRIVATE_KEY)).not.toBe(encrypt(PRIVATE_KEY));
  });

  it("rejects a tampered ciphertext rather than returning wrong plaintext", () => {
    const [iv, authTag, ciphertext] = encrypt(PRIVATE_KEY).split(":");
    const flipped = (ciphertext[0] === "a" ? "b" : "a") + ciphertext.slice(1);

    expect(() => decrypt([iv, authTag, flipped].join(":"))).toThrow();
  });

  it("rejects a payload missing a part", () => {
    expect(() => decrypt("deadbeef:cafe")).toThrow(/Malformed/);
  });

  it("round-trips unicode", () => {
    expect(decrypt(encrypt("Universiti — 大学 — 🎓"))).toBe("Universiti — 大学 — 🎓");
  });
});

describe("crypto — binary API (certificate artifacts)", () => {
  const AAD = Buffer.from("VC-2026-A7X2");

  it("round-trips a multi-megabyte buffer byte for byte", () => {
    const key = generateContentKey();
    const pdf = randomBytes(3 * 1024 * 1024);

    expect(decryptBuffer(encryptBuffer(pdf, key, AAD), key, AAD).equals(pdf)).toBe(true);
  });

  it("survives bytes the string API would corrupt", () => {
    // NUL bytes and lone surrogates: `encrypt` runs these through a UTF-8
    // string, which replaces invalid sequences with U+FFFD. This is the exact
    // reason the binary API exists rather than reusing the string one.
    const key = generateContentKey();
    const hostile = Buffer.from([0x00, 0xff, 0xfe, 0x00, 0xed, 0xa0, 0x80, 0x25, 0x50, 0x44, 0x46]);

    expect(decryptBuffer(encryptBuffer(hostile, key), key).equals(hostile)).toBe(true);
    expect(Buffer.from(decrypt(encrypt(hostile.toString("utf8"))), "utf8").equals(hostile)).toBe(false);
  });

  it("prefixes the magic and adds exactly 32 bytes of overhead", () => {
    const artifact = encryptBuffer(Buffer.from("%PDF-1.7 ..."), generateContentKey());

    expect(artifact.subarray(0, 4).toString("ascii")).toBe("VCE1");
    expect(artifact.length).toBe("%PDF-1.7 ...".length + 32);
    expect(isEncryptedArtifact(artifact)).toBe(true);
  });

  it("does not mistake a plaintext PDF for an artifact", () => {
    expect(isEncryptedArtifact(Buffer.from("%PDF-1.7 a plaintext certificate"))).toBe(false);
    expect(isEncryptedArtifact(Buffer.from("VCE1"))).toBe(false); // too short to be one
  });

  it("produces different ciphertext each time, from the random IV", () => {
    const key = generateContentKey();
    const pdf = Buffer.from("%PDF-1.7 ...");

    expect(encryptBuffer(pdf, key).equals(encryptBuffer(pdf, key))).toBe(false);
  });

  it("rejects a single flipped byte", () => {
    const key = generateContentKey();
    const artifact = encryptBuffer(Buffer.from("%PDF-1.7 ..."), key, AAD);
    artifact[artifact.length - 1] ^= 0x01;

    expect(() => decryptBuffer(artifact, key, AAD)).toThrow();
  });

  it("rejects an artifact replayed under a different credential id", () => {
    const key = generateContentKey();
    const artifact = encryptBuffer(Buffer.from("%PDF-1.7 ..."), key, AAD);

    expect(() => decryptBuffer(artifact, key, Buffer.from("VC-2026-OTHER"))).toThrow();
  });

  it("rejects the wrong key", () => {
    const artifact = encryptBuffer(Buffer.from("%PDF-1.7 ..."), generateContentKey(), AAD);

    expect(() => decryptBuffer(artifact, generateContentKey(), AAD)).toThrow();
  });

  it("rejects bytes that are not an artifact at all", () => {
    expect(() => decryptBuffer(Buffer.from("%PDF-1.7 plaintext"), generateContentKey())).toThrow(
      /Not a VeriCred encrypted artifact/
    );
  });

  it("rejects a content key of the wrong length", () => {
    expect(() => encryptBuffer(Buffer.from("x"), randomBytes(16))).toThrow(/32 bytes/);
  });

  it("mints a distinct 32-byte key each call", () => {
    const a = generateContentKey();
    const b = generateContentKey();

    expect(a.length).toBe(32);
    expect(a.equals(b)).toBe(false);
  });

  it("wraps a content key through the string API, as the DB column will", () => {
    // How Certificate.encKeyEnc is produced, mirroring Issuer.operatorKeyEnc.
    const key = generateContentKey();
    const unwrapped = Buffer.from(decrypt(encrypt(key.toString("hex"))), "hex");

    expect(unwrapped.equals(key)).toBe(true);
  });
});
