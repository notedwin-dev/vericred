import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RouteError } from "@/lib/route-error";

/**
 * POST /api/user/unlink-account
 *
 * Removes a linked OAuth provider from the current user, refusing if it's
 * their only sign-in method (no password, no wallet, no other provider) —
 * that would otherwise lock them out of their own account.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { provider?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const provider = body.provider;
  if (!provider) {
    return NextResponse.json({ error: "Missing provider" }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: session.user.id },
        select: {
          walletAddress: true,
          passwordHash: true,
          emailVerified: true,
          accounts: { select: { provider: true } },
        },
      });
      if (!user) {
        throw new RouteError(404, "User not found");
      }

      const hasCredentialsLogin = Boolean(user.passwordHash && user.emailVerified);
      const remainingProviders = user.accounts.filter((a) => a.provider !== provider).length;
      const canUnlink = Boolean(user.walletAddress) || hasCredentialsLogin || remainingProviders > 0;

      if (!canUnlink) {
        throw new RouteError(409, "Can't unlink your only sign-in method. Set a password or connect a wallet first.");
      }

      // Read (above) and delete happen inside the same serializable
      // transaction so two concurrent unlink requests can't both pass the
      // guard and leave the user with zero sign-in methods — Postgres
      // aborts whichever transaction loses the conflict (see catch below).
      await tx.account.deleteMany({
        where: { userId: session.user.id, provider },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof RouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json(
        { error: "Another change to your account happened at the same time — please try again." },
        { status: 409 }
      );
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
