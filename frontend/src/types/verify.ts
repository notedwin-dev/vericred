import type { CertificateStatus } from "@/types";

/**
 * Shape returned by `GET /api/verify/[credentialId]`. `exists` covers both
 * on-chain and off-chain-only records (issued without a recipient wallet
 * yet, so nothing to anchor — see lib/anchor.ts); `onChain` distinguishes
 * an anchored credential from one still waiting on a wallet. `valid` is
 * only ever true when `onChain` is.
 */
export interface VerifyApiResult {
  exists: boolean;
  onChain: boolean;
  valid: boolean;
  credentialId: string;
  /** The authoritative CID: the chain's when anchored, otherwise ours. */
  cid?: string;
  chainCid?: string;
  dbCid?: string;
  /**
   * Whether the anchored CID and our off-chain index agree. A `mismatch` is
   * reported but deliberately does not make `valid` false — see the route.
   */
  cidAgreement?: "match" | "mismatch" | "chain-only" | "db-only" | "none";
  issuer?: string;
  issuedAt?: number;
  txHash?: string;
  certificate: {
    recipientName: string;
    status: CertificateStatus;
    expiresAt: string | null;
    revokedAt: string | null;
    revocationReason: string | null;
    course: { name: string };
    issuer: { organizationName: string };
  } | null;
}
