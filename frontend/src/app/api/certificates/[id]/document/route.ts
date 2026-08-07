import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { DocumentUnavailableError, getCertificatePdf } from "@/lib/certificate-document";
import { getReadOnlyContract } from "@/lib/contract";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/certificates/[id]/document
 *
 * The authoritative certificate PDF, decrypted. Unlike the public PNG preview
 * this carries the award grade, so it is available only to the people entitled
 * to see it: the recipient, the issuing institution, and admins — the same
 * three-way check as GET /api/certificates/[id].
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const certificate = await prisma.certificate.findUnique({
    where: { id },
    // The one query in the app that needs the wrapped key; lib/prisma.ts omits
    // it everywhere else so it cannot leak into a response body.
    omit: { encKeyEnc: false },
    include: { course: { include: { issuer: true, template: true } } },
  });

  if (!certificate) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }

  const isAdmin = session.user.role === "ADMIN";
  const isRecipient = certificate.recipientId === session.user.id;
  let isOwningIssuer = false;
  if (!isAdmin && !isRecipient && session.user.role === "ISSUER") {
    const issuer = await prisma.issuer.findUnique({ where: { userId: session.user.id } });
    isOwningIssuer = !!issuer && certificate.course.issuerId === issuer.id;
  }

  if (!isAdmin && !isRecipient && !isOwningIssuer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Retrieve by the anchored CID when there is one: fetching by a value the
  // mutable index could have been made to lie about would undo the point of
  // verifying the bytes at all.
  let cid = certificate.cid;
  try {
    const [chainExists, , chainCid] = await getReadOnlyContract().verifyCredential(
      certificate.credentialId
    );
    if (chainExists && chainCid) cid = chainCid;
  } catch {
    // Chain unreachable — fall back to the indexed CID rather than denying
    // the holder their own document over an RPC outage.
  }

  try {
    const { pdf, source } = await getCertificatePdf(certificate, { cid });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${certificate.credentialId}.pdf"`,
        // Never cached by a CDN or shared proxy: this is the private artifact.
        "Cache-Control": "private, no-store",
        "X-VeriCred-Source": source,
      },
    });
  } catch (error) {
    if (error instanceof DocumentUnavailableError) {
      // Deliberately not falling back to a re-render here. Doing so would mask
      // a genuine retrieval or tampering failure behind a document that looks
      // right, which is precisely the situation this endpoint exists to detect.
      console.error("Certificate document unavailable for %s:", certificate.credentialId, error);
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("Failed to produce certificate document:", error);
    return NextResponse.json({ error: "Failed to produce the certificate document" }, { status: 500 });
  }
}
