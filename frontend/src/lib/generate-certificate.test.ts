import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked so the test can capture the exact bytes handed to Pinata. The
// integration suites deliberately leave this unmocked and exercise the real
// render-and-pin path; this file is the unit test that inspects the payload.
vi.mock("./ipfs", () => ({
  uploadToIPFS: vi.fn(async () => ({ cid: "bafyfake", mock: true })),
}));

import { decrypt, decryptBuffer, generateContentKey, isEncryptedArtifact } from "./crypto";
import { generateCertificate, renderCertificatePdf } from "./generate-certificate";
import { uploadToIPFS } from "./ipfs";

const GRADE = "First Class Honours";

const params = {
  credentialId: "VC-2026-A7X2",
  recipientName: "Ada Lovelace",
  courseName: "Blockchain Development",
  issuerName: "Asia Pacific University",
  grade: GRADE,
  templateLayout: { title: "Certificate of Completion" },
  issuedAt: new Date("2026-08-06T00:00:00Z"),
  verifyUrl: "http://localhost:3000/verify/VC-2026-A7X2",
};

/** The bytes handed to uploadToIPFS on the most recent call. */
function pinnedBytes(): Buffer {
  const mocked = vi.mocked(uploadToIPFS);
  expect(mocked).toHaveBeenCalled();
  return mocked.mock.calls[mocked.mock.calls.length - 1][0];
}

function unwrapKey(encKeyEnc: string): Buffer {
  return Buffer.from(decrypt(encKeyEnc), "hex");
}

describe("generateCertificate", () => {
  beforeEach(() => {
    vi.mocked(uploadToIPFS).mockClear();
  });

  it("pins ciphertext, not the PDF", async () => {
    await generateCertificate(params);
    const pinned = pinnedBytes();

    expect(pinned.subarray(0, 4).toString("ascii")).toBe("VCE1");
    expect(pinned.subarray(0, 4).toString("ascii")).not.toBe("%PDF");
  });

  it("publishes bytes that are not a readable document at all", async () => {
    // The whole point of the feature: someone who pulls the artifact off a
    // public gateway gets an opaque blob, not a certificate.
    //
    // Note this deliberately does NOT assert `!pinned.includes(GRADE)`.
    // @react-pdf Flate-compresses its content streams, so that substring is
    // absent even from a plaintext PDF — such an assertion passes whether or
    // not encryption is happening, and proves nothing. What is worth asserting
    // is that the bytes cannot be parsed as a document without the key.
    await generateCertificate(params);
    const pinned = pinnedBytes();

    expect(pinned.subarray(0, 4).toString("ascii")).not.toBe("%PDF");
    expect(isEncryptedArtifact(pinned)).toBe(true);
    expect(() => decryptBuffer(pinned, generateContentKey(), Buffer.from(params.credentialId))).toThrow();
  });

  it("puts the grade inside the artifact, where only a key-holder sees it", async () => {
    // Proven by difference rather than substring, for the compression reason
    // above: the grade must actually change the encrypted document.
    const withGrade = await renderCertificatePdf(params);
    const withoutGrade = await renderCertificatePdf({ ...params, grade: undefined });

    expect(withGrade.equals(withoutGrade)).toBe(false);
  });

  it("produces an artifact that decrypts back to a PDF containing the grade", async () => {
    const result = await generateCertificate(params);
    const pdf = decryptBuffer(
      pinnedBytes(),
      unwrapKey(result.encKeyEnc),
      Buffer.from(params.credentialId)
    );

    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("binds the artifact to its credential id, so it cannot be replayed as another", async () => {
    const result = await generateCertificate(params);

    expect(() =>
      decryptBuffer(pinnedBytes(), unwrapKey(result.encKeyEnc), Buffer.from("VC-2026-OTHER"))
    ).toThrow();
  });

  it("reports a content hash over exactly the bytes it pinned", async () => {
    const { createHash } = await import("node:crypto");
    const result = await generateCertificate(params);

    expect(result.contentHash).toBe(
      "sha256:" + createHash("sha256").update(pinnedBytes()).digest("hex")
    );
  });

  it("returns Pinata's cid and propagates the mock flag for the caller's guard", async () => {
    const result = await generateCertificate(params);

    expect(result.cid).toBe("bafyfake");
    expect(result.mock).toBe(true);
  });

  it("recomputes the CID of the bytes it pinned", async () => {
    const { computeCidV1 } = await import("./cid");
    const result = await generateCertificate(params);

    expect(result.computedCid).toBe(await computeCidV1(pinnedBytes()));
    expect(result.computedCid?.startsWith("baf")).toBe(true);
  });

  it("uses a fresh content key per certificate", async () => {
    const a = await generateCertificate(params);
    const b = await generateCertificate(params);

    expect(unwrapKey(a.encKeyEnc).equals(unwrapKey(b.encKeyEnc))).toBe(false);
  });
});

describe("renderCertificatePdf", () => {
  it("renders a PDF carrying the grade when one is given", async () => {
    const pdf = await renderCertificatePdf(params);

    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("renders without a grade, for the public preview", async () => {
    const pdf = await renderCertificatePdf({ ...params, grade: undefined });

    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});
