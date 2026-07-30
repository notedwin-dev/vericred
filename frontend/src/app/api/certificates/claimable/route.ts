import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/certificates/claimable
 *
 * Lists certificates issued to the current session's email address that
 * nobody has claimed yet (`recipientId` is still null) — a course issuer
 * can create a certificate for someone by email alone, before that person
 * has an account at all. Once they sign up/in with the matching email,
 * these show up here so they can claim them from the dashboard. See
 * POST /api/certificates/[id]/claim.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.user.email) {
    return NextResponse.json({ certificates: [] });
  }

  const certificates = await prisma.certificate.findMany({
    where: {
      recipientEmail: { equals: session.user.email, mode: "insensitive" },
      recipientId: null,
      status: "PENDING",
    },
    include: {
      course: {
        select: {
          name: true,
          issuer: { select: { organizationName: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ certificates });
}
