import { NextRequest, NextResponse } from "next/server";
import { getReadOnlyContract } from "@/lib/contract";
import { parseContractError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ credentialId: string }> };

/**
 * GET /api/verify/[credentialId]
 *
 * Public, unauthenticated verification endpoint. A credential can exist
 * off-chain only (issued without a recipient wallet, PDF already pinned to
 * IPFS, waiting to be anchored — see lib/anchor.ts) — that's still a real,
 * publicly viewable record, just not yet blockchain-verified. `exists`
 * covers both cases; `onChain` distinguishes them so callers can show
 * "pending" instead of treating an unanchored certificate as not found.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { credentialId } = await params;

  if (!credentialId) {
    return NextResponse.json({ error: "credentialId is required" }, { status: 400 });
  }

  let onChain = false;
  let valid = false;
  let cid: string | undefined;
  let chainCid: string | undefined;
  let issuer: string | undefined;
  let issuedAt: number | undefined;

  try {
    const contract = getReadOnlyContract();
    const [chainExists, chainValid, chainCidValue, chainIssuer, chainIssuedAt] =
      await contract.verifyCredential(credentialId);

    if (chainExists) {
      onChain = true;
      valid = chainValid;
      chainCid = chainCidValue || undefined;
      cid = chainCid;
      issuer = chainIssuer;
      issuedAt = Number(chainIssuedAt);
    }
  } catch (error) {
    console.error("Failed to read on-chain verification:", error);
    return NextResponse.json({ error: parseContractError(error) }, { status: 500 });
  }

  const certificate = await prisma.certificate.findUnique({
    where: { credentialId },
    include: { course: { include: { issuer: true } } },
  });

  if (!onChain && !certificate) {
    return NextResponse.json({ exists: false, onChain: false, valid: false, credentialId });
  }

  if (!onChain && certificate) {
    // Off-chain-only: the CID and issuance time come from our own record
    // instead of the (nonexistent) on-chain one. No `issuer` wallet yet —
    // there's nothing to attribute on-chain until this is anchored.
    cid = certificate.cid ?? undefined;
    issuedAt = Math.floor(certificate.issuedAt.getTime() / 1000);
  }

  // Cross-check against the off-chain record: a certificate revoked here
  // but not yet revoked on-chain shouldn't report as valid just because
  // the chain transaction hasn't landed yet — revocation, like anchoring,
  // is fire-and-forget from the issuer's browser. (`valid` is already only
  // ever true when `onChain` is, so no need to check both.)
  const combinedValid = valid && certificate?.status !== "REVOKED";

  /**
   * Whether the CID anchored on-chain and the one in our own index agree.
   *
   * The chain value previously overwrote the database one with no comparison,
   * so an off-chain row whose `cid` had been altered still rendered as a
   * perfectly valid credential and nothing anywhere noticed. The contract's
   * own documentation expects the caller to check the CID rather than trust
   * it, so reporting this is the minimum honest behaviour.
   *
   * Deliberately does *not* affect `valid`. The chain is authoritative and a
   * divergence is far more likely to be an administrative slip in the mutable
   * index than evidence the anchored credential is bad — invalidating a
   * genuinely anchored certificate over it would be the worse failure. The UI
   * surfaces the warning instead.
   */
  const dbCid = certificate?.cid ?? undefined;
  const cidAgreement: "match" | "mismatch" | "chain-only" | "db-only" | "none" =
    chainCid && dbCid ? (chainCid === dbCid ? "match" : "mismatch") : chainCid ? "chain-only" : dbCid ? "db-only" : "none";

  if (cidAgreement === "mismatch") {
    console.error(
      "[verify] CID divergence for %s: chain=%s db=%s — the off-chain index disagrees with what was anchored.",
      credentialId,
      chainCid,
      dbCid
    );
  }

  return NextResponse.json({
    exists: true,
    onChain,
    valid: combinedValid,
    credentialId,
    cid,
    chainCid,
    dbCid,
    cidAgreement,
    issuer,
    issuedAt,
    txHash: certificate?.txHash ?? undefined,
    certificate: certificate
      ? {
          recipientName: certificate.recipientName,
          status: certificate.status,
          expiresAt: certificate.expiresAt,
          revokedAt: certificate.revokedAt,
          revocationReason: certificate.revocationReason,
          course: {
            name: certificate.course.name,
          },
          issuer: {
            organizationName: certificate.course.issuer.organizationName,
          },
        }
      : null,
  });
}
