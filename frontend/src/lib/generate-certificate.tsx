import { createHash } from "node:crypto";
import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { CertificatePdf, type CertificateTemplateLayout } from "./certificate-pdf";
import { computeCidV1 } from "./cid";
import { encrypt, encryptBuffer, generateContentKey } from "./crypto";
import { uploadToIPFS } from "./ipfs";

export interface RenderCertificateParams {
  credentialId: string;
  recipientName: string;
  courseName: string;
  issuerName: string;
  templateLayout: CertificateTemplateLayout;
  issuedAt: Date;
  verifyUrl: string;
  /** Omit to render the public representation; include for the artifact. */
  grade?: string;
}

export interface GeneratedCertificate {
  /** Pinata's CID. Authoritative — this is the value anchored on-chain. */
  cid: string;
  /** sha256 of the exact bytes pinned, as `sha256:<hex>`. */
  contentHash: string;
  /**
   * The CID we derive locally from the same bytes. Equal to `cid` when our
   * UnixFS parameters match Pinata's; null if computation failed. Kept
   * separately so a divergence is visible rather than silently accepted.
   */
  computedCid: string | null;
  /** Wrapped content key, ready for `Certificate.encKeyEnc`. */
  encKeyEnc: string;
  /** True when Pinata was unconfigured and the CID is a local fake. */
  mock: boolean;
}

/**
 * Renders the certificate PDF. Split out from `generateCertificate` so the
 * public preview path can produce a document from the same template without
 * encrypting or pinning anything.
 */
export async function renderCertificatePdf(params: RenderCertificateParams): Promise<Buffer> {
  const qrDataUrl = await QRCode.toDataURL(params.verifyUrl, { width: 320, margin: 1 });

  return renderToBuffer(
    <CertificatePdf
      layout={params.templateLayout}
      recipientName={params.recipientName}
      courseName={params.courseName}
      issuerName={params.issuerName}
      credentialId={params.credentialId}
      issuedAt={params.issuedAt}
      qrDataUrl={qrDataUrl}
      grade={params.grade}
    />
  );
}

/**
 * Renders the certificate, encrypts it, and pins the ciphertext to IPFS.
 *
 * The bytes that leave this function for IPFS are AES-256-GCM ciphertext, not
 * a document: anyone who pulls the artifact off a public gateway gets an
 * opaque blob. That is what lets the PDF carry the award grade, which the
 * public verify API and the public PNG preview both withhold — the privacy
 * split the proposal describes. See docs/prds/encrypted-certificates.md.
 *
 * The content key is fresh per certificate and is wrapped with ENCRYPTION_KEY
 * for storage, mirroring `lib/operator-wallet.ts`. The credentialId is bound
 * in as AAD, so an artifact lifted from one certificate fails to authenticate
 * if served as another.
 *
 * This remains the only place a certificate's CID comes from — issuers never
 * type one in.
 */
export async function generateCertificate(
  params: RenderCertificateParams
): Promise<GeneratedCertificate> {
  const pdf = await renderCertificatePdf(params);

  const key = generateContentKey();
  try {
    const artifact = encryptBuffer(pdf, key, Buffer.from(params.credentialId));
    const contentHash = `sha256:${createHash("sha256").update(artifact).digest("hex")}`;
    const computedCid = await computeCidV1(artifact);

    // `.vcenc`, not `.pdf`: the pinned bytes are not a document, and naming
    // them one invites someone to open the ciphertext expecting a certificate.
    const { cid, mock } = await uploadToIPFS(artifact, `${params.credentialId}.vcenc`);

    // Never fatal. A divergence means verification degrades from re-deriving
    // the on-chain CID to comparing the sha256 contentHash, which is still a
    // genuine re-hash of the retrieved bytes. Skipped when the CID is a local
    // fake, since disagreeing with a mock is expected, not a signal.
    if (!mock && computedCid && computedCid !== cid) {
      console.error(
        "[cid] local CID does not match Pinata's for %s: computed=%s pinata=%s. " +
          "Integrity checks will fall back to contentHash. See docs/prds/encrypted-certificates.md.",
        params.credentialId,
        computedCid,
        cid
      );
    }

    return { cid, contentHash, computedCid, encKeyEnc: encrypt(key.toString("hex")), mock };
  } finally {
    key.fill(0);
  }
}
