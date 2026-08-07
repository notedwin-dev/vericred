import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/institutions/pending
 *
 * Admin-only. Lists institution registration requests awaiting approval
 * (docs/prds/institution-registration-prd.md 6.6).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const pending = await prisma.issuer.findMany({
    where: { status: "PENDING" },
    include: { user: { select: { email: true, createdAt: true } } },
    orderBy: { createdAt: "asc" },
  });

  const institutions = pending.map((issuer) => ({
    id: issuer.id,
    organizationName: issuer.organizationName,
    logo: issuer.logo,
    walletAddress: issuer.walletAddress,
    contactEmail: issuer.user.email,
    submittedAt: issuer.createdAt.toISOString(),
  }));

  return NextResponse.json({ institutions });
}
