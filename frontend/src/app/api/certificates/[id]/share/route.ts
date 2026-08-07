import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageShares } from "@/lib/certificate-share";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

const MAX_DAYS = 365;

/**
 * POST /api/certificates/[id]/share
 *
 * Mints a revocable link letting someone without an account open this
 * certificate's decrypted document — the employer-verification case the
 * proposal describes, without handing over any key material.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const certificate = await prisma.certificate.findUnique({ where: { id } });
  if (!certificate) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }
  if (!canManageShares(certificate, session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { expiresInDays?: number } = {};
  try {
    body = await request.json();
  } catch {
    // An empty body is fine — it just means a share that never expires.
  }

  let expiresAt: Date | undefined;
  if (body.expiresInDays !== undefined) {
    const days = Number(body.expiresInDays);
    if (!Number.isFinite(days) || days <= 0 || days > MAX_DAYS) {
      return NextResponse.json(
        { error: `expiresInDays must be between 1 and ${MAX_DAYS}` },
        { status: 400 }
      );
    }
    expiresAt = new Date(Date.now() + days * 86_400_000);
  }

  const share = await prisma.certificateShare.create({
    data: { certificateId: certificate.id, createdById: session.user.id, expiresAt },
  });

  return NextResponse.json(
    {
      share: {
        id: share.id,
        token: share.token,
        url: new URL(`/s/${share.token}`, request.nextUrl.origin).toString(),
        expiresAt: share.expiresAt,
        createdAt: share.createdAt,
      },
    },
    { status: 201 }
  );
}

/** GET /api/certificates/[id]/share — the certificate's live shares. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const certificate = await prisma.certificate.findUnique({ where: { id } });
  if (!certificate) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }
  if (!canManageShares(certificate, session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const shares = await prisma.certificateShare.findMany({
    where: { certificateId: id, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ shares });
}
