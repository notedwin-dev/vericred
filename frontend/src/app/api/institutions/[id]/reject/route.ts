import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/institutions/[id]/reject
 *
 * Admin-only. Rejects a PENDING institution registration request with a
 * mandatory reason (mirrors credential revocation's EmptyReason
 * convention). No on-chain action, no role change (docs/prds/
 * institution-registration-prd.md 6.6).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: { reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reason = body?.reason?.trim();
  if (!reason) {
    return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });
  }

  const issuer = await prisma.issuer.findUnique({ where: { id } });
  if (!issuer) {
    return NextResponse.json({ error: "Institution request not found" }, { status: 404 });
  }
  if (issuer.status !== "PENDING") {
    return NextResponse.json({ error: `Institution request is already ${issuer.status.toLowerCase()}` }, { status: 409 });
  }

  const updated = await prisma.issuer.update({
    where: { id },
    data: { status: "REJECTED", rejectionReason: reason },
  });

  return NextResponse.json({ issuer: { id: updated.id, status: updated.status, rejectionReason: updated.rejectionReason } });
}
