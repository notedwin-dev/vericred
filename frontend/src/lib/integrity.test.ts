import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./ipfs", () => ({ fetchFromGateway: vi.fn() }));

import { computeCidV1 } from "./cid";
import { checkArtifactIntegrity } from "./integrity";
import { fetchFromGateway } from "./ipfs";

const ARTIFACT = Buffer.from("VCE1 pretend this is an encrypted certificate");
const CONTENT_HASH = `sha256:${createHash("sha256").update(ARTIFACT).digest("hex")}`;

describe("checkArtifactIntegrity", () => {
  beforeEach(() => {
    vi.mocked(fetchFromGateway).mockReset();
  });

  it("verifies by re-deriving the on-chain CID from the retrieved bytes", async () => {
    const realCid = (await computeCidV1(ARTIFACT))!;
    vi.mocked(fetchFromGateway).mockResolvedValue(ARTIFACT);

    const report = await checkArtifactIntegrity({
      cid: realCid,
      contentHash: CONTENT_HASH,
      computedCid: realCid,
    });

    expect(report.status).toBe("verified");
    expect(report.method).toBe("cid");
  });

  it("needs no decryption key — it hashes the ciphertext as-is", async () => {
    // The property that lets encrypted certificates stay publicly verifiable.
    const realCid = (await computeCidV1(ARTIFACT))!;
    vi.mocked(fetchFromGateway).mockResolvedValue(ARTIFACT);

    const report = await checkArtifactIntegrity({
      cid: realCid,
      contentHash: null,
      computedCid: realCid,
    });

    expect(report.status).toBe("verified");
  });

  it("falls back to the content hash when the CID cannot be re-derived", async () => {
    // What happens if our UnixFS parameters ever diverge from Pinata's.
    vi.mocked(fetchFromGateway).mockResolvedValue(ARTIFACT);

    const report = await checkArtifactIntegrity({
      cid: "bafy-pinata-cid-we-cannot-reproduce",
      contentHash: CONTENT_HASH,
      computedCid: "bafy-something-else",
    });

    expect(report.status).toBe("verified");
    expect(report.method).toBe("content-hash");
  });

  it("reports a mismatch when the gateway returns different bytes", async () => {
    vi.mocked(fetchFromGateway).mockResolvedValue(Buffer.from("VCE1 substituted content"));

    const report = await checkArtifactIntegrity({
      cid: "bafy-cid",
      contentHash: CONTENT_HASH,
      computedCid: "bafy-cid",
    });

    expect(report.status).toBe("mismatch");
  });

  it("does not brand a pre-encryption certificate as tampered with", async () => {
    // Legacy rows have no reference value. Reporting "mismatch" would tell
    // every historical credential holder their certificate had been altered.
    const report = await checkArtifactIntegrity({
      cid: "bafy-legacy-plaintext",
      contentHash: null,
      computedCid: null,
    });

    expect(report.status).toBe("unavailable");
    expect(report.reason).toBe("legacy");
    expect(vi.mocked(fetchFromGateway)).not.toHaveBeenCalled();
  });

  it("reports an unreachable gateway as unavailable, not as a mismatch", async () => {
    vi.mocked(fetchFromGateway).mockRejectedValue(new Error("ETIMEDOUT"));

    const report = await checkArtifactIntegrity({
      cid: "bafy-cid",
      contentHash: CONTENT_HASH,
      computedCid: null,
    });

    expect(report.status).toBe("unavailable");
    expect(report.reason).toBe("gateway");
  });

  it("reports an unanchored, unpinned credential as unavailable", async () => {
    const report = await checkArtifactIntegrity({
      cid: null,
      contentHash: CONTENT_HASH,
      computedCid: null,
    });

    expect(report.status).toBe("unavailable");
    expect(report.reason).toBe("no-cid");
  });
});
