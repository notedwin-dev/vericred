import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { autoAnchorCertificate } from "@/lib/anchor";
import { RouteError } from "@/lib/route-error";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/certificates/[id]/claim
 *
 * Lets a signed-in user claim a PENDING certificate that was issued to
 * their account's email address (see GET /api/certificates/claimable).
 * Claiming always moves it out of PENDING (nobody claimed) — if the user
 * already has a wallet linked, this also attempts to anchor it on-chain
 * immediately (see lib/anchor.ts) and the certificate ends up ACTIVE; if
 * there's no wallet, or the anchor attempt fails, it ends up CLAIMED:
 * ownership confirmed, not yet blockchain-verified.
 */
export async function POST(_request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.user.email) {
    return NextResponse.json(
      { error: "Your account has no email address to match this certificate against." },
      { status: 400 }
    );
  }

  const { id } = await params;

  try {
    const claimed = await prisma.$transaction(async (tx) => {
      const certificate = await tx.certificate.findUnique({ where: { id } });
      if (!certificate) {
        throw new RouteError(404, "Certificate not found");
      }
      if (certificate.recipientId) {
        throw new RouteError(409, "This certificate has already been claimed");
      }
      if (certificate.status !== "PENDING") {
        throw new RouteError(409, "This certificate isn't available to claim");
      }
      if (
        !certificate.recipientEmail ||
        certificate.recipientEmail.toLowerCase() !== session.user.email!.toLowerCase()
      ) {
        throw new RouteError(403, "This certificate wasn't issued to your account's email address");
      }

      return tx.certificate.update({
        where: { id },
        data: {
          recipientId: session.user.id,
          walletAddress: certificate.walletAddress || session.user.walletAddress || null,
          // Provisional — flipped to ACTIVE below if a wallet is present
          // and the on-chain anchor attempt succeeds.
          status: "CLAIMED",
        },
      });
    });

    if (claimed.walletAddress) {
      const txHash = await autoAnchorCertificate(claimed);
      if (txHash) {
        const anchored = await prisma.certificate.update({
          where: { id },
          data: { status: "ACTIVE", txHash },
        });
        return NextResponse.json({ certificate: anchored });
      }
    }

    return NextResponse.json({ certificate: claimed });
  } catch (error) {
    if (error instanceof RouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Failed to claim certificate:", error);
    return NextResponse.json({ error: "Failed to claim certificate" }, { status: 500 });
  }
}
