import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAdminSigner, getSignerContract } from "@/lib/contract";
import { createOperatorWallet } from "@/lib/operator-wallet";
import { parseContractError } from "@/lib/errors";
import { sendEmail } from "@/lib/email";
import { buildInstitutionWelcomeEmail } from "@/lib/email-templates";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/institutions/[id]/approve
 *
 * Admin-only. Fully synchronous, all-or-nothing (docs/prds/
 * institution-registration-prd.md Decision 7): provisions an operator
 * wallet, authorises BOTH the institution's own registered wallet and the
 * new operator wallet on-chain, and only on success flips
 * User.role -> ISSUER + Issuer.status -> APPROVED. A failed transaction
 * leaves nothing changed.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const issuer = await prisma.issuer.findUnique({ where: { id } });
  if (!issuer) {
    return NextResponse.json({ error: "Institution request not found" }, { status: 404 });
  }
  if (issuer.status !== "PENDING") {
    return NextResponse.json({ error: `Institution request is already ${issuer.status.toLowerCase()}` }, { status: 409 });
  }

  const signer = getAdminSigner();
  if (!signer) {
    return NextResponse.json(
      {
        error:
          "Server-side signing is not configured (ADMIN_PRIVATE_KEY missing). Authorise this institution from the admin wallet directly.",
      },
      { status: 501 }
    );
  }

  let operatorAddress: string;
  let operatorKeyEnc: string;
  try {
    ({ address: operatorAddress, operatorKeyEnc } = createOperatorWallet());
  } catch (error) {
    console.error("Failed to provision operator wallet:", error);
    return NextResponse.json(
      { error: "Server-side encryption is not configured (ENCRYPTION_KEY missing)." },
      { status: 501 }
    );
  }

  try {
    const contract = getSignerContract(signer);

    const institutionTx = await contract.authoriseInstitution(issuer.walletAddress);
    await institutionTx.wait();

    const operatorTx = await contract.authoriseInstitution(operatorAddress);
    await operatorTx.wait();
  } catch (error) {
    console.error("Failed to authorise institution on-chain:", error);
    return NextResponse.json({ error: parseContractError(error) }, { status: 500 });
  }

  const [, updatedIssuer] = await prisma.$transaction([
    prisma.user.update({ where: { id: issuer.userId }, data: { role: "ISSUER" } }),
    prisma.issuer.update({
      where: { id: issuer.id },
      data: { status: "APPROVED", operatorAddress, operatorKeyEnc },
    }),
  ]);

  // Only now — after the on-chain calls landed and the role actually flipped
  // — is it true that the institution can issue (Decision 6/7). A failed send
  // must not undo an approval that already happened on-chain, so it's logged
  // and reported, not thrown.
  const contact = await prisma.user.findUnique({
    where: { id: issuer.userId },
    select: { email: true },
  });

  let welcomeEmailSent = false;
  if (contact?.email) {
    // Institutions sign in with password + wallet signature, so send them to
    // their own sign-in page; it forwards to /issuer once authenticated, and
    // straight through if they're already signed in.
    const getStartedUrl = new URL("/login/institution", request.nextUrl.origin);
    getStartedUrl.searchParams.set("callbackUrl", "/issuer");

    try {
      await sendEmail(
        contact.email,
        buildInstitutionWelcomeEmail({
          organizationName: updatedIssuer.organizationName,
          getStartedUrl: getStartedUrl.toString(),
        })
      );
      welcomeEmailSent = true;
    } catch (error) {
      console.error("Failed to send institution welcome email:", error);
    }
  }

  return NextResponse.json({
    issuer: { id: updatedIssuer.id, status: updatedIssuer.status, operatorAddress: updatedIssuer.operatorAddress },
    welcomeEmailSent,
  });
}
