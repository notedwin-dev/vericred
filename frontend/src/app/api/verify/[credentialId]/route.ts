import { NextRequest, NextResponse } from "next/server";
import { getReadOnlyContract } from "@/lib/contract";
import { parseContractError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ credentialId: string }> };

/**
 * GET /api/verify/[credentialId]
 *
 * Public, unauthenticated verification endpoint. Calls the contract's
 * read-only `verifyCredential`, and enriches the result with whatever
 * off-chain metadata (recipient name, course, issuer) is available so a
 * verifier gets a full picture without needing to query IPFS themselves.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { credentialId } = await params;

  if (!credentialId) {
    return NextResponse.json({ error: "credentialId is required" }, { status: 400 });
  }

  try {
    const contract = getReadOnlyContract();
    const result = await contract.verifyCredential(credentialId);

    const [exists, valid, cid, issuer, issuedAt, recipient, expiresAt] = result;

    if (!exists) {
      return NextResponse.json({
        exists: false,
        valid: false,
        credentialId,
      });
    }

    const certificate = await prisma.certificate.findUnique({
      where: { credentialId },
      include: { course: { include: { issuer: true } } },
    });

    return NextResponse.json({
      exists: true,
      valid,
      credentialId,
      cid,
      issuer,
      issuedAt: Number(issuedAt),
      recipient,
      expiresAt: Number(expiresAt),
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
  } catch (error) {
    console.error("Failed to verify credential:", error);
    return NextResponse.json({ error: parseContractError(error) }, { status: 500 });
  }
}
