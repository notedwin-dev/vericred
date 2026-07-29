import { NextRequest, NextResponse } from "next/server";
import { isAddress, verifyMessage } from "ethers";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { autoAnchorCertificates } from "@/lib/anchor";

/**
 * POST /api/wallet/link
 *
 * Links a wallet address to the authenticated user's account. If a
 * `signature` (over `message`) is provided, it is verified against the
 * claimed address so the user proves ownership of the wallet before it's
 * attached — otherwise the address is stored unverified.
 *
 * Also retroactively anchors any of this user's PENDING certificates that
 * were issued without a wallet (matched by recipientEmail, since that's
 * the only link between a not-yet-claimed certificate and an account) —
 * see lib/anchor.ts.
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
      select: { id: true, walletAddress: true, email: true },
    });

    if (user.email) {
      const pending = await prisma.certificate.findMany({
        where: { recipientEmail: user.email, status: "PENDING", walletAddress: null, cid: { not: null } },
      });
      if (pending.length > 0) {
        await prisma.certificate.updateMany({
          where: { id: { in: pending.map((c) => c.id) } },
          data: { walletAddress: normalized, recipientId: user.id },
        });
        await autoAnchorCertificates(pending.map((c) => ({ ...c, walletAddress: normalized })));
      }
    }

    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "This wallet is already linked to another account" }, { status: 409 });
    }
    console.error("Failed to link wallet:", error);
    return NextResponse.json({ error: "Failed to link wallet" }, { status: 500 });
  }
}
