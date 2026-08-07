import { NextRequest, NextResponse } from "next/server";
import { isAddress, verifyMessage } from "ethers";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isValidUsername } from "@/lib/validation";
import { findWalletConflict } from "@/lib/wallet";

/**
 * POST /api/user/onboarding
 *
 * Completes signup for an account created by an OAuth callback, which has no
 * form step to collect the username and wallet that every other path requires
 * up front (docs/institution-registration-prd.md Decision 9).
 *
 * Applies both in one write: a half-finished account would just be sent
 * straight back to /onboarding by the layout gate anyway.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { username?: string; walletAddress?: string; message?: string; signature?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { username, walletAddress, message, signature } = body ?? {};

  if (!username || typeof username !== "string" || !isValidUsername(username.toLowerCase())) {
    return NextResponse.json(
      { error: "Username must be 3-32 characters (lowercase letters, numbers, hyphens, underscores)" },
      { status: 400 }
    );
  }
  if (!walletAddress || !isAddress(walletAddress)) {
    return NextResponse.json({ error: "A valid wallet address is required" }, { status: 400 });
  }
  if (!message || !signature) {
    return NextResponse.json({ error: "A wallet signature is required" }, { status: 400 });
  }

  try {
    const recovered = verifyMessage(message, signature);
    if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json({ error: "Signature does not match the provided address" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Could not verify signature" }, { status: 400 });
  }

  const normalizedUsername = username.toLowerCase();
  const normalizedWallet = walletAddress.toLowerCase();

  const [usernameOwner, walletConflict] = await Promise.all([
    prisma.user.findUnique({ where: { username: normalizedUsername }, select: { id: true } }),
    findWalletConflict(normalizedWallet),
  ]);

  if (usernameOwner && usernameOwner.id !== session.user.id) {
    return NextResponse.json({ error: "Username is already taken" }, { status: 409 });
  }
  if (walletConflict && !(walletConflict.type === "user" && walletConflict.ownerId === session.user.id)) {
    return NextResponse.json({ error: "This wallet is already linked to another account" }, { status: 409 });
  }

  try {
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { username: normalizedUsername, walletAddress: normalizedWallet },
      select: { id: true, username: true, walletAddress: true },
    });
    return NextResponse.json({ user });
  } catch (error) {
    // Lost a race to the same username or wallet between the checks above and
    // this write — the unique constraints are the real source of truth.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "That username or wallet was just taken" }, { status: 409 });
    }
    throw error;
  }
}
