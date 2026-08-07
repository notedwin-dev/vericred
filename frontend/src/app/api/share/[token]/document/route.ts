import { NextRequest, NextResponse } from "next/server";
import { DocumentUnavailableError, getCertificatePdf } from "@/lib/certificate-document";
import { resolveShareToken } from "@/lib/certificate-share";
import { getReadOnlyContract } from "@/lib/contract";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ token: string }> };

const REJECTION_STATUS = { "not-found": 404, revoked: 410, expired: 410 } as const;
const REJECTION_MESSAGE = {
  "not-found": "This share link is not valid.",
  revoked: "This share link has been withdrawn by the credential holder.",
  expired: "This share link has expired.",
} as const;

/**
 * GET /api/share/[token]/document
 *
 * The decrypted certificate, for someone holding a share link and no account.
 *
 * A thin wrapper over the same `getCertificatePdf` the authenticated download
 * uses — the authorisation is the only difference. Nothing about the token
 * carries key material; it names a grant the holder can withdraw.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { token } = await params;

  const resolved = await resolveShareToken(token);
  if (!resolved.ok) {
    return NextResponse.json(
      { error: REJECTION_MESSAGE[resolved.reason] },
      { status: REJECTION_STATUS[resolved.reason] }
    );
  }

  const { share } = resolved;
  const certificate = share.certificate;

  let cid = certificate.cid;
  try {
    const [chainExists, , chainCid] = await getReadOnlyContract().verifyCredential(
      certificate.credentialId
    );
    if (chainExists && chainCid) cid = chainCid;
  } catch {
    // Chain unreachable — fall back to the indexed CID.
  }

  try {
    const { pdf } = await getCertificatePdf(certificate, { cid });

    // Best-effort: a counter is not worth failing a legitimate view over.
    prisma.certificateShare
      .update({ where: { id: share.id }, data: { viewCount: { increment: 1 } } })
      .catch(() => {});

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${certificate.credentialId}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof DocumentUnavailableError) {
      console.error("Shared document unavailable for %s:", certificate.credentialId, error);
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("Failed to produce shared certificate document:", error);
    return NextResponse.json({ error: "Failed to produce the certificate document" }, { status: 500 });
  }
}
