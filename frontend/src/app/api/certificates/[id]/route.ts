import { NextRequest, NextResponse } from "next/server";
import { isAddress, ZeroAddress } from "ethers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revokeCertificateOnChain } from "@/lib/revoke";
import type { RevokeCertificateInput, ConfirmAnchorInput } from "@/types";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/certificates/[id]
 *
 * Fetches a single certificate by its database id. Accessible to the
 * recipient, the issuing course's issuer, or an admin.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const certificate = await prisma.certificate.findUnique({
    where: { id },
    include: { course: true },
  });

  if (!certificate) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }

  if (session.user.role === "ADMIN") {
    return NextResponse.json({ certificate });
  }

  if (session.user.role === "ISSUER") {
    const issuer = await prisma.issuer.findUnique({ where: { userId: session.user.id } });
    if (issuer && certificate.course.issuerId === issuer.id) {
      return NextResponse.json({ certificate });
    }
  }

  if (certificate.recipientId === session.user.id) {
    return NextResponse.json({ certificate });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * PATCH /api/certificates/[id]
 *
 * Two actions, distinguished by body shape — both require the calling user
 * to be the issuer that owns the certificate's course, or an admin:
 *
 *  - `{ reason }`  — revoke. Anchors the revocation on-chain via
 *    lib/revoke.ts (operator wallet where it anchored the credential, else the
 *    admin signer) and records it in the off-chain index. The off-chain write
 *    happens whether or not the on-chain call succeeds, so the outcome is
 *    reported back in `onChain` rather than failing the request.
 *  - `{ txHash }`  — confirm anchor. Called after a client-side (or
 *    server-side, see lib/anchor.ts) `issueCredential`/`issueCredentialBatch`
 *    transaction confirms, moving the certificate from PENDING to ACTIVE.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ISSUER" && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: Partial<RevokeCertificateInput & ConfirmAnchorInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const certificate = await prisma.certificate.findUnique({
    where: { id },
    include: { course: true },
  });
  if (!certificate) {
    return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
  }

  if (session.user.role === "ISSUER") {
    const issuer = await prisma.issuer.findUnique({ where: { userId: session.user.id } });
    if (!issuer || certificate.course.issuerId !== issuer.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (typeof body?.txHash === "string") {
    const txHash = body.txHash.trim();
    if (!txHash) {
      return NextResponse.json({ error: "txHash is required" }, { status: 400 });
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      return NextResponse.json({ error: "txHash must be a valid 32-byte hex hash (0x followed by 64 hex characters)" }, { status: 400 });
    }
    if (certificate.status !== "PENDING") {
      return NextResponse.json({ error: "Only a PENDING certificate can be confirmed as anchored" }, { status: 409 });
    }
    if (!certificate.walletAddress || !isAddress(certificate.walletAddress) || certificate.walletAddress === ZeroAddress) {
      return NextResponse.json({ error: "Certificate has no recipient wallet to anchor to" }, { status: 409 });
    }

    const updated = await prisma.certificate.update({
      where: { id },
      data: { status: "ACTIVE", txHash },
    });
    return NextResponse.json({ certificate: updated });
  }

  if (typeof body?.reason !== "string") {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }
  const reason = body.reason.trim();
  if (!reason) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  if (certificate.status === "REVOKED") {
    return NextResponse.json({ error: "Certificate is already revoked" }, { status: 409 });
  }

  // Anchor first, then record. Either ordering is safe for a verifier, since
  // the verify endpoint reports a credential as invalid when *either* source
  // says revoked. The window that remains is a successful on-chain revocation
  // whose database write then fails: the chain is correct but our index still
  // says ACTIVE. That is handled below rather than eliminated — closing it
  // properly needs a durable record of the intent written before the
  // transaction is submitted, which is a larger change than this route.
  const onChain = await revokeCertificateOnChain(certificate, reason);

  const data = {
    status: "REVOKED" as const,
    revokedAt: new Date(),
    revocationReason: reason,
    // Only write a hash when this attempt produced one. Leaving the column
    // untouched otherwise means a retry that finds the credential already
    // revoked on-chain cannot erase the hash an earlier attempt recorded.
    ...(onChain.status === "revoked" ? { revokeTxHash: onChain.txHash } : {}),
  };

  let updated;
  try {
    updated = await prisma.certificate.update({ where: { id }, data });
  } catch (dbError) {
    console.error(
      `[revoke] Database update failed for ${certificate.credentialId}` +
        (onChain.status === "revoked" ? ` after a successful on-chain revocation (${onChain.txHash})` : "") +
        ". Retrying once...",
      dbError
    );
    try {
      updated = await prisma.certificate.update({ where: { id }, data });
    } catch (retryError) {
      // Surface the transaction hash rather than losing it to a 500 — it is
      // the only handle on an on-chain revocation the index does not reflect,
      // and a retry of this request would report `already-revoked` and never
      // learn it. A re-run still converges the status; only the hash is lost.
      console.error(
        `[revoke] Database update retry also failed for ${certificate.credentialId}` +
          (onChain.status === "revoked" ? ` (txHash ${onChain.txHash})` : "") +
          ". Manual reconciliation needed.",
        retryError
      );
      return NextResponse.json(
        {
          error:
            onChain.status === "revoked"
              ? "The revocation was recorded on-chain but could not be saved. It will show as revoked to verifiers; please retry to update the record."
              : "Failed to record the revocation.",
          onChain,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ certificate: updated, onChain });
}
