import { NextRequest, NextResponse } from "next/server";
import { getReadOnlyContract } from "@/lib/contract";
import { checkArtifactIntegrity } from "@/lib/integrity";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ credentialId: string }> };

/**
 * GET /api/verify/[credentialId]/integrity
 *
 * Public. Retrieves the artifact from IPFS and re-hashes it, reporting whether
 * it is still the one this credential claims.
 *
 * Kept separate from the main verify route on purpose: this makes a
 * network-bound call to a third-party gateway, and the credential page must
 * not wait on that to render. It is requested on demand from the integrity
 * badge instead.
 *
 * No decryption key is involved — the artifact is ciphertext and hashing
 * ciphertext is exactly as conclusive, which is what keeps encrypted
 * certificates publicly verifiable.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { credentialId } = await params;

  if (!credentialId) {
    return NextResponse.json({ error: "credentialId is required" }, { status: 400 });
  }

  const certificate = await prisma.certificate.findUnique({
    where: { credentialId },
    select: { cid: true, contentHash: true, computedCid: true },
  });

  if (!certificate) {
    return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  }

  // Prefer the anchored CID: retrieving by a value the database could have
  // been made to lie about would defeat the point of checking at all.
  let cid = certificate.cid;
  try {
    const [chainExists, , chainCid] = await getReadOnlyContract().verifyCredential(credentialId);
    if (chainExists && chainCid) cid = chainCid;
  } catch (error) {
    console.warn("[integrity] chain unreachable for %s, using the indexed CID:", credentialId, error);
  }

  const report = await checkArtifactIntegrity({
    cid,
    contentHash: certificate.contentHash,
    computedCid: certificate.computedCid,
  });

  // 200 even when unavailable: this is a report about the artifact, not a
  // failure of this endpoint, and an unreachable gateway is not a server error.
  return NextResponse.json(
    { ...report, checkedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
