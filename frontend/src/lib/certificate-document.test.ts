import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ipfs", () => ({ fetchFromGateway: vi.fn(), uploadToIPFS: vi.fn() }));

import { encrypt, encryptBuffer, generateContentKey } from "./crypto";
import { DocumentUnavailableError, getCertificatePdf } from "./certificate-document";
import { fetchFromGateway } from "./ipfs";

const CREDENTIAL_ID = "VC-2026-A7X2";

function buildCertificate(overrides: Record<string, unknown> = {}) {
  return {
    credentialId: CREDENTIAL_ID,
    recipientName: "Ada Lovelace",
    issuedAt: new Date("2026-08-06T00:00:00Z"),
    grade: "First Class Honours",
    cid: "bafy-cid",
    contentHash: null as string | null,
    encKeyEnc: null as string | null,
    course: {
      name: "Blockchain Development",
      template: { layout: { title: "Certificate of Completion" } },
      issuer: { organizationName: "Asia Pacific University" },
    },
    ...overrides,
  };
}

/** Builds a real encrypted artifact plus the row bookkeeping that goes with it. */
function buildArtifact(pdf: Buffer, credentialId = CREDENTIAL_ID) {
  const key = generateContentKey();
  const artifact = encryptBuffer(pdf, key, Buffer.from(credentialId));
  return {
    artifact,
    encKeyEnc: encrypt(key.toString("hex")),
    contentHash: `sha256:${createHash("sha256").update(artifact).digest("hex")}`,
  };
}

describe("getCertificatePdf", () => {
  beforeEach(() => {
    vi.mocked(fetchFromGateway).mockReset();
  });

  it("decrypts the artifact retrieved from IPFS", async () => {
    const original = Buffer.from("%PDF-1.7 the real certificate with First Class Honours");
    const { artifact, encKeyEnc, contentHash } = buildArtifact(original);
    vi.mocked(fetchFromGateway).mockResolvedValue(artifact);

    const { pdf, source } = await getCertificatePdf(buildCertificate({ encKeyEnc, contentHash }));

    expect(source).toBe("decrypted");
    expect(pdf.equals(original)).toBe(true);
  });

  it("retrieves by the caller's CID, so the anchored value can override the index", async () => {
    const { artifact, encKeyEnc, contentHash } = buildArtifact(Buffer.from("%PDF-1.7 x"));
    vi.mocked(fetchFromGateway).mockResolvedValue(artifact);

    await getCertificatePdf(buildCertificate({ encKeyEnc, contentHash }), { cid: "bafy-from-chain" });

    expect(vi.mocked(fetchFromGateway)).toHaveBeenCalledWith("bafy-from-chain");
  });

  it("refuses bytes that do not match the recorded fingerprint, before decrypting", async () => {
    const { encKeyEnc } = buildArtifact(Buffer.from("%PDF-1.7 original"));
    vi.mocked(fetchFromGateway).mockResolvedValue(Buffer.from("VCE1 substituted bytes"));

    await expect(
      getCertificatePdf(buildCertificate({ encKeyEnc, contentHash: "sha256:" + "0".repeat(64) }))
    ).rejects.toBeInstanceOf(DocumentUnavailableError);
  });

  it("rejects an artifact that belongs to a different credential", async () => {
    // Same key, different AAD: lifting one certificate's artifact onto
    // another's row must fail rather than silently serve the wrong document.
    const { artifact, encKeyEnc, contentHash } = buildArtifact(
      Buffer.from("%PDF-1.7 someone else"),
      "VC-2026-OTHER"
    );
    vi.mocked(fetchFromGateway).mockResolvedValue(artifact);

    await expect(
      getCertificatePdf(buildCertificate({ encKeyEnc, contentHash }))
    ).rejects.toThrow();
  });

  it("re-renders a legacy certificate from the database, with no gateway call", async () => {
    const { pdf, source } = await getCertificatePdf(buildCertificate({ encKeyEnc: null }));

    expect(source).toBe("regenerated");
    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");
    expect(vi.mocked(fetchFromGateway)).not.toHaveBeenCalled();
  });

  it("reports an unreachable gateway rather than hanging or returning nothing", async () => {
    const { encKeyEnc, contentHash } = buildArtifact(Buffer.from("%PDF-1.7 x"));
    vi.mocked(fetchFromGateway).mockRejectedValue(new Error("ETIMEDOUT"));

    await expect(
      getCertificatePdf(buildCertificate({ encKeyEnc, contentHash }))
    ).rejects.toBeInstanceOf(DocumentUnavailableError);
  });

  it("reports a certificate that has no pinned document", async () => {
    const { encKeyEnc } = buildArtifact(Buffer.from("%PDF-1.7 x"));

    await expect(
      getCertificatePdf(buildCertificate({ encKeyEnc, cid: null }))
    ).rejects.toBeInstanceOf(DocumentUnavailableError);
  });
});
