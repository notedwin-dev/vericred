import { NextRequest, NextResponse } from "next/server";
import { isAddress, verifyMessage } from "ethers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAdminSigner, getSignerContract } from "@/lib/contract";
import { findWalletConflict } from "@/lib/wallet";
import { parseContractError } from "@/lib/errors";

/**
 * PATCH /api/issuer/wallet
 *
 * Lets an approved institution change its own on-chain identity wallet
 * (docs/prds/institution-registration-prd.md 6.9, Decision 11). All-or-nothing:
 * the new address must pass signature proof, then authoriseInstitution(new)
 * + removeInstitution(old) both succeed before Issuer.walletAddress updates
 * in the DB -- never leaves an abandoned old wallet still authorised.
 */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const issuer = await prisma.issuer.findUnique({ where: { userId: session.user.id } });
  if (!issuer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (issuer.status !== "APPROVED") {
    return NextResponse.json(
      { error: `Institution must be approved before its wallet can be changed (currently ${issuer.status.toLowerCase()})` },
      { status: 409 }
    );
  }

  let body: { walletAddress?: string; message?: string; signature?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { walletAddress, message, signature } = body ?? {};

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

  const normalizedNew = walletAddress.toLowerCase();
  if (normalizedNew === issuer.walletAddress.toLowerCase()) {
    return NextResponse.json({ error: "This is already the institution's current wallet" }, { status: 409 });
  }

  const conflict = await findWalletConflict(normalizedNew);
  if (conflict) {
    return NextResponse.json({ error: "This wallet is already linked to another account" }, { status: 409 });
  }

  const signer = getAdminSigner();
  if (!signer) {
    return NextResponse.json(
      {
        error: "Server-side signing is not configured (ADMIN_PRIVATE_KEY missing). Re-authorise this wallet from the admin wallet directly.",
      },
      { status: 501 }
    );
  }

  try {
    const contract = getSignerContract(signer);

    const authTx = await contract.authoriseInstitution(normalizedNew);
    await authTx.wait();

    const removeTx = await contract.removeInstitution(issuer.walletAddress);
    await removeTx.wait();
  } catch (error) {
    console.error("Failed to re-authorise institution wallet on-chain:", error);
    return NextResponse.json({ error: parseContractError(error) }, { status: 500 });
  }

  const updated = await prisma.issuer.update({
    where: { id: issuer.id },
    data: { walletAddress: normalizedNew },
  });

  return NextResponse.json({ issuer: { id: updated.id, walletAddress: updated.walletAddress } });
}
