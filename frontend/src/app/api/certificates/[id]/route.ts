import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { RevokeCertificateInput } from "@/types";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/certificates/[id]
 *
 * Fetches a single certificate by its database id. Accessible to the
 * recipient, the issuing course's issuer, or an admin.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const certificate = await prisma.certificate.findUnique({
    where: { id },
    include: { course: true },
  });

  if (!certificate) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }

  if (session.user.role === "ADMIN") {
    return NextResponse.json({ certificate });
  }

  if (session.user.role === "ISSUER") {
    const issuer = await prisma.issuer.findUnique({ where: { userId: session.user.id } });
    if (issuer && certificate.course.issuerId === issuer.id) {
      return NextResponse.json({ certificate });
    }
  }

  if (certificate.recipientId === session.user.id) {
    return NextResponse.json({ certificate });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * PATCH /api/certificates/[id]
 *
 * Revokes a certificate. Requires the calling user to be the issuer that
 * owns the certificate's course, or an admin. The actual on-chain
 * `revokeCredential` transaction is expected to be signed client-side; this
 * endpoint records the revocation in the off-chain index once that
 * transaction succeeds (or ahead of it, for issuer-initiated flows).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ISSUER" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: RevokeCertificateInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body?.reason !== "string") {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }
  const reason = body.reason.trim();
  if (!reason) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  const certificate = await prisma.certificate.findUnique({
    where: { id },
    include: { course: true },
  });
  if (!certificate) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }

  if (session.user.role === "ISSUER") {
    const issuer = await prisma.issuer.findUnique({ where: { userId: session.user.id } });
    if (!issuer || certificate.course.issuerId !== issuer.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (certificate.status === "REVOKED") {
    return NextResponse.json({ error: "Certificate is already revoked" }, { status: 409 });
  }

  const updated = await prisma.certificate.update({
    where: { id },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      revocationReason: reason,
    },
  });

  return NextResponse.json({ certificate: updated });
}
