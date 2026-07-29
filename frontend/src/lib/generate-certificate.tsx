import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { CertificatePdf, type CertificateTemplateLayout } from "./certificate-pdf";
import { uploadToIPFS } from "./ipfs";

export interface GenerateCertificateParams {
  credentialId: string;
  recipientName: string;
  courseName: string;
  issuerName: string;
  templateLayout: CertificateTemplateLayout;
  issuedAt: Date;
  verifyUrl: string;
}

/**
 * Renders the certificate PDF (with an embedded QR code linking to the
 * public verify page) and pins it to IPFS, returning the CID that gets
 * anchored on-chain. This is the only place a certificate's CID comes
 * from — issuers never type one in.
 */
export async function generateCertificate(params: GenerateCertificateParams) {
  const qrDataUrl = await QRCode.toDataURL(params.verifyUrl, { width: 320, margin: 1 });

  const buffer = await renderToBuffer(
    <CertificatePdf
      layout={params.templateLayout}
      recipientName={params.recipientName}
      courseName={params.courseName}
      issuerName={params.issuerName}
      credentialId={params.credentialId}
      issuedAt={params.issuedAt}
      qrDataUrl={qrDataUrl}
    />
  );

  const { cid } = await uploadToIPFS(buffer, `${params.credentialId}.pdf`);
  return { cid };
}
