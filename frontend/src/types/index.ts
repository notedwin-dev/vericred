/**
 * Shared TypeScript types for the VeriCred backend: contract data shapes,
 * domain enums that mirror the Prisma schema, and DTOs used across API
 * routes. Keeping these independent of generated Prisma types means route
 * handlers and client code can share a stable, hand-authored contract.
 */

// ── Roles & status enums (mirror prisma/schema.prisma) ──────────────

export type Role = "USER" | "ISSUER" | "ADMIN";

export type CertificateStatus = "PENDING" | "ACTIVE" | "REVOKED" | "EXPIRED";

// ── On-chain data ────────────────────────────────────────────────────

/**
 * Mirrors the `Credential` struct returned by VeriCred.sol's
 * `getCredential` / `getCredentialsPaged`, after ethers' Result tuple has
 * been mapped into a plain object (see `mapCredential` in lib/utils.ts).
 */
export interface CredentialData {
  issuer: string;
  issuedAt: number;
  revokedAt: number;
  revoked: boolean;
  cid: string;
  credentialId: string;
  revocationReason: string;
}

/** Shape returned by the public `verifyCredential(credentialId)` call. */
export interface VerifyCredentialResult {
  exists: boolean;
  valid: boolean;
  cid: string;
  issuer: string;
  issuedAt: number;
}

// ── Domain DTOs ───────────────────────────────────────────────────────

export interface CertificateDTO {
  id: string;
  credentialId: string;
  recipientName: string;
  recipientEmail: string | null;
  recipientId: string | null;
  courseId: string;
  cid: string | null;
  txHash: string | null;
  walletAddress: string | null;
  issuedAt: string;
  expiresAt: string | null;
  status: CertificateStatus;
  revokedAt: string | null;
  revocationReason: string | null;
  createdAt: string;
  course?: {
    name: string;
    issuer?: {
      organizationName: string;
    };
  };
}

export interface IssueCertificateInput {
  credentialId?: string;
  recipientName: string;
  recipientEmail?: string;
  recipientId?: string;
  courseId: string;
  walletAddress?: string;
  expiresAt?: string;
}

/** One row of a CSV batch upload — same shape, one course per batch. */
export interface BatchIssueCertificateRow {
  recipientName: string;
  recipientEmail?: string;
  walletAddress?: string;
}

export interface ConfirmAnchorInput {
  txHash: string;
}

export interface RevokeCertificateInput {
  reason: string;
}

export interface CourseDTO {
  id: string;
  issuerId: string;
  name: string;
  description: string | null;
  templateId: string;
  createdAt: string;
  certificateCount?: number;
}

export interface CreateCourseInput {
  name: string;
  description?: string;
  templateId: string;
}

export interface UpdateCourseInput {
  name?: string;
  description?: string;
  templateId?: string;
}

export interface CertificateTemplateDTO {
  id: string;
  issuerId: string;
  name: string;
  layout: unknown;
  createdAt: string;
}

export interface CreateTemplateInput {
  name: string;
  layout: unknown;
}

export interface CollectionLinkDTO {
  id: string;
  courseId: string;
  token: string;
  maxCollections: number | null;
  currentCount: number;
  linkExpiresAt: string | null;
  certExpiresAt: string | null;
  active: boolean;
  createdAt: string;
}

export interface CreateCollectionLinkInput {
  maxCollections?: number;
  linkExpiresAt?: string;
  certExpiresAt?: string;
}

/** Omitted fields are left unchanged; explicit `null` clears that field. */
export interface UpdateCollectionLinkInput {
  maxCollections?: number | null;
  linkExpiresAt?: string | null;
  certExpiresAt?: string | null;
  active?: boolean;
}

export interface ClaimCollectionLinkInput {
  recipientName: string;
  recipientEmail?: string;
  walletAddress?: string;
}

export interface IssuerDTO {
  id: string;
  userId: string;
  organizationName: string;
  logo: string | null;
  walletAddress: string;
  createdAt: string;
}

export interface InstitutionDTO {
  address: string;
  authorised: boolean;
  authorisedAt?: string;
  authorisedBy?: string;
}

// ── Session augmentation (see lib/auth.ts) ───────────────────────────

export interface SessionUser {
  id: string;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  image?: string | null;
  role: Role;
  walletAddress: string | null;
}

// ── Generic API envelope ─────────────────────────────────────────────

export interface ApiError {
  error: string;
}
