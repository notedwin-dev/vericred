import { createHash } from "node:crypto";
import { computeCidV1 } from "@/lib/cid";
import { fetchFromGateway } from "@/lib/ipfs";

export type IntegrityStatus = "verified" | "mismatch" | "unavailable";

export interface IntegrityReport {
  status: IntegrityStatus;
  /** How it was established. `cid` is the stronger of the two. */
  method?: "cid" | "content-hash";
  /** Why it could not be established. */
  reason?: "legacy" | "gateway" | "no-cid";
  cid?: string;
  bytes?: number;
}

export interface IntegrityInput {
  /** The CID to retrieve by — the chain's when anchored. */
  cid: string | null | undefined;
  contentHash: string | null | undefined;
  computedCid: string | null | undefined;
}

/**
 * Checks that the artifact actually stored on IPFS is the one this credential
 * claims, by re-hashing the retrieved bytes.
 *
 * This is the check `contracts/VeriCred.sol` documents and the app never
 * performed: previously the CID was a string passed from Pinata to Postgres to
 * the chain and back, never tested against any bytes.
 *
 * Note that no decryption key is involved. The artifact is ciphertext, and
 * hashing ciphertext is exactly as conclusive as hashing plaintext — which is
 * why encrypting certificates costs public verifiability nothing.
 *
 * Two methods, strongest first:
 *
 *  - `cid`          — the bytes re-derive the CID anchored on-chain. Closes
 *                     even the case of a gateway serving something else,
 *                     because the chain value is not ours to forge.
 *  - `content-hash` — the bytes match the sha256 recorded at issuance. Still a
 *                     genuine re-hash, and sound because the *retrieval key*
 *                     came from the chain; weaker only against a dishonest
 *                     gateway colluding with a compromised database.
 */
export async function checkArtifactIntegrity(input: IntegrityInput): Promise<IntegrityReport> {
  const { cid, contentHash, computedCid } = input;

  if (!cid) {
    return { status: "unavailable", reason: "no-cid" };
  }

  // Rows issued before encryption existed have neither reference value, so
  // there is nothing to compare against. They are *not* a mismatch — saying
  // so would brand every historical certificate as tampered with.
  if (!contentHash && !computedCid) {
    return { status: "unavailable", reason: "legacy", cid };
  }

  let bytes: Buffer;
  try {
    bytes = await fetchFromGateway(cid);
  } catch (error) {
    console.warn("[integrity] could not retrieve %s from the gateway:", cid, error);
    return { status: "unavailable", reason: "gateway", cid };
  }

  if (computedCid) {
    const recomputed = await computeCidV1(bytes);
    if (recomputed && recomputed === cid) {
      return { status: "verified", method: "cid", cid, bytes: bytes.length };
    }
  }

  if (contentHash) {
    const actual = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (actual === contentHash) {
      return { status: "verified", method: "content-hash", cid, bytes: bytes.length };
    }
  }

  return { status: "mismatch", cid, bytes: bytes.length };
}
