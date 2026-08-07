import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeCidV1 } from "./cid";

describe("computeCidV1", () => {
  it("is deterministic — the same bytes always give the same CID", async () => {
    const bytes = Buffer.from("%PDF-1.7 a certificate");

    expect(await computeCidV1(bytes)).toBe(await computeCidV1(bytes));
  });

  it("changes completely when a single byte changes", async () => {
    const a = Buffer.from("%PDF-1.7 a certificate");
    const b = Buffer.from("%PDF-1.7 a certificatf");

    expect(await computeCidV1(a)).not.toBe(await computeCidV1(b));
  });

  it("produces a raw CIDv1 for a single-block file", async () => {
    // `bafkrei` is base32 CIDv1 + raw codec + sha2-256. This is the prefix
    // Pinata actually returned for a pinned certificate, which is how we know
    // it uses raw leaves — matching it is the whole point of these parameters.
    const cid = await computeCidV1(Buffer.from("%PDF-1.7 small enough for one block"));

    expect(cid?.startsWith("bafkrei")).toBe(true);
  });

  it("agrees with an independently constructed raw block CID", async () => {
    // Cross-check against multiformats directly rather than trusting the
    // importer's defaults: for a file under the chunk size with raw leaves,
    // the root CID is just sha2-256 of the bytes under the raw codec. If the
    // importer is configured differently (dag-pb wrapping, a different
    // chunker) these diverge and this test fails — which is exactly the
    // signal we want, since we cannot test against Pinata in CI.
    const { CID } = await import("multiformats/cid");
    const { sha256 } = await import("multiformats/hashes/sha2");
    const raw = await import("multiformats/codecs/raw");

    const bytes = randomBytes(1024);
    const expected = CID.createV1(raw.code, await sha256.digest(bytes)).toString();

    expect(await computeCidV1(Buffer.from(bytes))).toBe(expected);
  });

  it("handles a file large enough to need a dag-pb tree", async () => {
    // Above the 262144-byte chunker limit the root is no longer a raw block,
    // so it should come back as dag-pb (`bafybei`) instead.
    const cid = await computeCidV1(randomBytes(600 * 1024));

    expect(cid?.startsWith("bafybei")).toBe(true);
  });

  it("returns null instead of throwing, so it can never block issuance", async () => {
    // Recomputation is a cross-check, not a precondition for issuing a
    // certificate. Callers rely on being able to carry on with null.
    expect(await computeCidV1(null as unknown as Buffer)).toBeNull();
  });
});
