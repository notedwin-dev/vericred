import type { CertificateStatus } from "@/types";

/**
 * Shape returned by `GET /api/verify/[credentialId]` — the on-chain
 * verification result enriched with whatever off-chain metadata is on file.
 */
export interface VerifyApiResult {
  exists: boolean;
  valid: boolean;
  credentialId: string;
  cid?: string;
  issuer?: string;
  issuedAt?: number;
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
