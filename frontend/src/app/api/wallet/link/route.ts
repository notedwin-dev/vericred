import { NextRequest, NextResponse } from "next/server";
import { isAddress, verifyMessage } from "ethers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/wallet/link
 *
 * Links a wallet address to the authenticated user's account. If a
 * `signature` (over `message`) is provided, it is verified against the
 * claimed address so the user proves ownership of the wallet before it's
 * attached — otherwise the address is stored unverified.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { address?: string; message?: string; signature?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { address, message, signature } = body ?? {};

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "A valid wallet address is required" }, { status: 400 });
  }

  if (message && signature) {
    try {
      const recovered = verifyMessage(message, signature);
      if (recovered.toLowerCase() !== address.toLowerCase()) {
        return NextResponse.json({ error: "Signature does not match the provided address" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Could not verify signature" }, { status: 400 });
    }
  }

  const normalized = address.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { walletAddress: normalized } });
  if (existing && existing.id !== session.user.id) {
    return NextResponse.json({ error: "This wallet is already linked to another account" }, { status: 409 });
  }

  try {
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { walletAddress: normalized },
      select: { id: true, walletAddress: true },
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Failed to link wallet:", error);
    return NextResponse.json({ error: "Failed to link wallet" }, { status: 500 });
  }
}
