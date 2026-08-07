import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { renderCertificateImage } from "@/lib/certificate-image";
import type { CertificateTemplateLayout } from "@/lib/certificate-pdf";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ credentialId: string }> };

/**
 * Bump when certificate-image.tsx changes shape, so cached copies and any
 * conditional requests holding an old ETag are invalidated rather than
 * serving a stale layout indefinitely.
 */
const TEMPLATE_VERSION = 1;

/**
 * GET /api/verify/[credentialId]/preview
 *
 * Public PNG of the certificate, rendered on demand from Postgres.
 *
 * This replaces embedding the pinned IPFS file directly. Once that file is
 * AES-GCM ciphertext there is nothing for a browser to render, and serving it
 * would hand a stranger an encrypted blob — so the public view is regenerated
 * from the database instead. It is deliberately a reduced document: `grade`
 * lives only inside the encrypted artifact and never appears here. See
 * docs/encrypted-certificates.md.
 *
 * Unauthenticated by design (this is the share target), which is why the ETag
 * is computed *before* rendering: a repeat visitor or CDN gets a 304 without
 * satori ever running.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { credentialId } = await params;

  if (!credentialId) {
    return NextResponse.json({ error: "credentialId is required" }, { status: 400 });
  }

  const certificate = await prisma.certificate.findUnique({
    where: { credentialId },
    include: { course: { include: { issuer: true, template: true } } },
  });

  if (!certificate) {
    return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  }

  const layout = (certificate.course.template?.layout ?? {}) as CertificateTemplateLayout;

  // Cheap to compute, and covers everything the image is drawn from.
  const etag = `"${createHash("sha256")
    .update(
      JSON.stringify({
        v: TEMPLATE_VERSION,
        credentialId,
        recipientName: certificate.recipientName,
        courseName: certificate.course.name,
        issuerName: certificate.course.issuer.organizationName,
        issuedAt: certificate.issuedAt.toISOString(),
        layout,
      })
    )
    .digest("hex")
    .slice(0, 32)}"`;

  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  const origin = request.nextUrl.origin;
  const qrDataUrl = await QRCode.toDataURL(
    `${origin}/verify/${encodeURIComponent(credentialId)}`,
    { width: 320, margin: 1 }
  );

  const image = await renderCertificateImage({
    layout,
    recipientName: certificate.recipientName,
    courseName: certificate.course.name,
    issuerName: certificate.course.issuer.organizationName,
    credentialId: certificate.credentialId,
    issuedAt: certificate.issuedAt,
    qrDataUrl,
  });

  const headers = new Headers(image.headers);
  headers.set("ETag", etag);
  headers.set("Cache-Control", "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800");

  return new NextResponse(image.body, { status: 200, headers });
}
