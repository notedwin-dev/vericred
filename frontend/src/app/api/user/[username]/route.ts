import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/user/:username
 *
 * Returns a public profile by username, including their active credentials.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    select: {
      id: true,
      name: true,
      username: true,
      image: true,
      createdAt: true,
      certificates: {
        where: { status: { in: ["ACTIVE", "EXPIRED"] } },
        select: {
          id: true,
          credentialId: true,
          recipientName: true,
          status: true,
          issuedAt: true,
          expiresAt: true,
          course: {
            select: {
              name: true,
              issuer: {
                select: { organizationName: true, logo: true },
              },
            },
          },
        },
        orderBy: { issuedAt: "desc" },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({ user });
}
