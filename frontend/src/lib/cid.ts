/**
 * Local CIDv1 computation for the exact bytes we pin.
 *
 * Why this exists: `contracts/VeriCred.sol` documents that a verifier
 * "recomputes the CID of the file they were given and compares it with this
 * value", but nothing in the app ever did — the CID was a string handed over
 * by Pinata and passed through to the chain untested. Being able to re-derive
 * it from bytes is what turns verification into an actual check.
 *
 * The parameters below are chosen to match what Pinata returns. The evidence
 * is the shape of a real pinned CID: `bafkrei…` is base32 CIDv1 with the raw
 * codec and sha2-256, which is exactly what the UnixFS importer produces for a
 * single-chunk file with `rawLeaves: true`. Larger input becomes a dag-pb tree
 * (`bafybei…`) under the same settings. The chunker and fan-out are left at
 * the importer's defaults, which are kubo's (fixed 262144, 174 children).
 *
 * This is still best-effort: Pinata does not document its DAG parameters and
 * CI cannot check against a live pin, so a mismatch is possible. It is handled
 * by degrading to the sha256 `contentHash` rather than failing — which is why
 * this returns null instead of throwing. See docs/prds/encrypted-certificates.md.
 */
export async function computeCidV1(bytes: Buffer): Promise<string | null> {
  try {
    if (!Buffer.isBuffer(bytes)) return null;

    const { importer } = await import("ipfs-unixfs-importer");
    const { MemoryBlockstore } = await import("blockstore-core/memory");

    const blockstore = new MemoryBlockstore();
    let root: string | null = null;

    for await (const entry of importer([{ content: bytes }], blockstore, {
      cidVersion: 1,
      rawLeaves: true,
    })) {
      root = entry.cid.toString();
    }

    return root;
  } catch (error) {
    console.warn("[cid] local CID computation failed; falling back to contentHash:", error);
    return null;
  }
}
