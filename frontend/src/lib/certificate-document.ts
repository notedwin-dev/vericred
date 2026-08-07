import { createHash } from "node:crypto";
import { decrypt, decryptBuffer, isEncryptedArtifact } from "@/lib/crypto";
import { fetchFromGateway } from "@/lib/ipfs";
import { renderCertificatePdf } from "@/lib/generate-certificate";
import type { CertificateTemplateLayout } from "@/lib/certificate-pdf";

/** Everything needed to produce the authoritative document for a certificate. */
export interface CertificateWithKey {
  credentialId: string;
  recipientName: string;
  issuedAt: Date;
  grade: string | null;
  cid: string | null;
  contentHash: string | null;
  encKeyEnc: string | null;
  course: {
    name: string;
    template: { layout: unknown } | null;
    issuer: { organizationName: string };
  };
}

export class DocumentUnavailableError extends Error {}

/**
 * Returns the real certificate PDF — the one carrying the award grade.
 *
 * Two paths, decided by whether the row has a content key:
 *
 *  - **Encrypted (current).** Retrieve the artifact from IPFS, confirm the
 *    bytes still hash to what was recorded at issuance, then decrypt. The
 *    hash check happens *before* decryption on purpose: bytes we cannot vouch
 *    for should never reach a decryptor, let alone a user.
 *  - **Legacy.** Rows issued before encryption have no key, and their pinned
 *    file is a plaintext PDF that is deliberately not being re-encrypted (see
 *    docs/prds/encrypted-certificates.md). Re-render from Postgres instead, which
 *    needs no gateway round-trip at all.
 *
 * Note the retrieval CID must be the chain's when the credential is anchored;
 * callers are responsible for passing that rather than the indexed value.
 */
export async function getCertificatePdf(
  certificate: CertificateWithKey,
  options: { cid?: string | null } = {}
): Promise<{ pdf: Buffer; source: "decrypted" | "regenerated" }> {
  const verifyUrl = `/verify/${encodeURIComponent(certificate.credentialId)}`;

  const renderFromDatabase = async () =>
    renderCertificatePdf({
      credentialId: certificate.credentialId,
      recipientName: certificate.recipientName,
      courseName: certificate.course.name,
      issuerName: certificate.course.issuer.organizationName,
      templateLayout: (certificate.course.template?.layout ?? {}) as CertificateTemplateLayout,
      issuedAt: certificate.issuedAt,
      grade: certificate.grade ?? undefined,
      verifyUrl,
    });

  if (!certificate.encKeyEnc) {
    return { pdf: await renderFromDatabase(), source: "regenerated" };
  }

  const cid = options.cid ?? certificate.cid;
  if (!cid) {
    throw new DocumentUnavailableError("This certificate has no document pinned to IPFS.");
  }

  let bytes: Buffer;
  try {
    bytes = await fetchFromGateway(cid);
  } catch (error) {
    throw new DocumentUnavailableError(
      `Could not retrieve the certificate document from IPFS: ${(error as Error).message}`
    );
  }

  if (certificate.contentHash) {
    const actual = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (actual !== certificate.contentHash) {
      throw new DocumentUnavailableError(
        "The stored document does not match the fingerprint recorded when it was issued."
      );
    }
  }

  if (!isEncryptedArtifact(bytes)) {
    throw new DocumentUnavailableError("The stored artifact is not in the expected format.");
  }

  const key = Buffer.from(decrypt(certificate.encKeyEnc), "hex");
  try {
    return {
      pdf: decryptBuffer(bytes, key, Buffer.from(certificate.credentialId)),
      source: "decrypted",
    };
  } finally {
    key.fill(0);
  }
}
