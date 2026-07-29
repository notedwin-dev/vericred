import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      walletAddress: true,
      passwordHash: true,
      emailVerified: true,
      accounts: { select: { provider: true } },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const hasCredentialsLogin = Boolean(user.passwordHash && user.emailVerified);
  const remainingProviders = user.accounts.filter((a) => a.provider !== provider).length;
  const canUnlink = Boolean(user.walletAddress) || hasCredentialsLogin || remainingProviders > 0;

  if (!canUnlink) {
    return NextResponse.json(
      { error: "Can't unlink your only sign-in method. Set a password or connect a wallet first." },
      { status: 409 }
    );
  }

  await prisma.account.deleteMany({
    where: { userId: session.user.id, provider },
  });

  return NextResponse.json({ ok: true });
}
