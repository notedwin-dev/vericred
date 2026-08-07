import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canManageShares } from "@/lib/certificate-share";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string; shareId: string }> };

/**
 * DELETE /api/certificates/[id]/share/[shareId]
 *
 * Withdraws a share. Because the content key never left the server, this
 * genuinely revokes access rather than merely asking someone to forget a URL.
 * Recorded as `revokedAt` rather than deleted, so the grant remains auditable.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, shareId } = await params;

  const share = await prisma.certificateShare.findUnique({
    where: { id: shareId },
    include: { certificate: true },
  });

  if (!share || share.certificateId !== id) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }
  if (!canManageShares(share.certificate, session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!share.revokedAt) {
    await prisma.certificateShare.update({
      where: { id: shareId },
      data: { revokedAt: new Date() },
    });
  }

  return NextResponse.json({ revoked: true });
}
