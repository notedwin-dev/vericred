import type { Certificate, Issuer } from "@prisma/client";
import { isAddress, ZeroAddress } from "ethers";
import { prisma } from "@/lib/prisma";
import { getSignerContract } from "@/lib/contract";
import { getOperatorSigner } from "@/lib/operator-wallet";

/**
 * Anchors certificates that have no issuer browser in the loop (a
 * recipient claiming a collection link, or linking a wallet days after
 * issuance) using the owning institution's platform-custodied operator
 * wallet — see lib/operator-wallet.ts. On-chain `issuer` correctly shows
 * that institution's own address, same as when the issuer signs
 * interactively with their own connected wallet.
 */

type AnchorableCertificate = Pick<
  Certificate,
  "id" | "credentialId" | "cid" | "walletAddress" | "expiresAt" | "courseId"
>;

function toUnixExpiry(expiresAt: Date | null): number {
  return expiresAt ? Math.floor(expiresAt.getTime() / 1000) : 0;
}

async function resolveIssuer(courseId: string): Promise<Issuer | null> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, include: { issuer: true } });
  return course?.issuer ?? null;
}

/** Anchors a single PENDING certificate that now has a wallet address. Returns txHash if successful, null otherwise. */
export async function autoAnchorCertificate(certificate: AnchorableCertificate): Promise<string | null> {
  if (!certificate.cid || !certificate.walletAddress || !isAddress(certificate.walletAddress) || certificate.walletAddress === ZeroAddress) {
    return null;
  }

  const issuer = await resolveIssuer(certificate.courseId);
  if (!issuer) return null;

  // Wrapped: getOperatorSigner returns null for a missing or mismatched
  // wallet, but decrypt() *throws* on a corrupt operatorKeyEnc. Called outside
  // a try, that propagated out of the collect route as a 500 — after the
  // certificate row and the incremented link counter had already committed.
  let signer;
  try {
    signer = getOperatorSigner(issuer);
  } catch (error) {
    console.error(`[anchor] Could not load the operator wallet for ${issuer.organizationName}:`, error);
    signer = null;
  }
  if (!signer) {
    console.warn(
      `[anchor] ${issuer.organizationName} has no usable operator wallet — leaving ${certificate.credentialId} PENDING.`
    );
    return null;
  }

  try {
    const contract = getSignerContract(signer);
    const tx = await contract.issueCredential(
      certificate.credentialId,
      certificate.cid,
      certificate.walletAddress,
      toUnixExpiry(certificate.expiresAt)
    );
    const receipt = await tx.wait();

    const txHash = receipt?.hash ?? tx.hash;
    try {
      await prisma.certificate.update({
        where: { id: certificate.id },
        data: { status: "ACTIVE", txHash },
      });
    } catch (dbError) {
      console.error(`[anchor] On-chain anchoring succeeded (${txHash}) but DB update failed for ${certificate.credentialId}. Retrying once...`, dbError);
      try {
        await prisma.certificate.update({
          where: { id: certificate.id },
          data: { status: "ACTIVE", txHash },
        });
      } catch (retryError) {
        console.error(`[anchor] DB update retry also failed for ${certificate.credentialId} (txHash ${txHash}). Manual recovery needed.`, retryError);
      }
    }
    return txHash;
  } catch (error) {
    console.error(`[anchor] Failed to auto-anchor ${certificate.credentialId}:`, error);
    return null;
  }
}

/**
 * Anchors many PENDING certificates (all with a wallet + cid already),
 * grouped by owning institution so each group is anchored in a single
 * issueCredentialBatch transaction signed by that institution's own
 * operator wallet — certificates from different issuers can never share
 * one transaction, since `issuer` on-chain is `msg.sender`.
 */
export async function autoAnchorCertificates(certificates: AnchorableCertificate[]): Promise<boolean> {
  const anchorable = certificates.filter(
    (c) => c.cid && c.walletAddress && isAddress(c.walletAddress) && c.walletAddress !== ZeroAddress
  );
  if (anchorable.length === 0) return false;

  const courseIds = [...new Set(anchorable.map((c) => c.courseId))];
  const courses = await prisma.course.findMany({
    where: { id: { in: courseIds } },
    include: { issuer: true },
  });
  const issuerByCourseId = new Map(courses.map((c) => [c.id, c.issuer]));

  const groups = new Map<string, { issuer: Issuer; certs: AnchorableCertificate[] }>();
  for (const cert of anchorable) {
    const issuer = issuerByCourseId.get(cert.courseId);
    if (!issuer) continue;
    const group = groups.get(issuer.id) ?? { issuer, certs: [] };
    group.certs.push(cert);
    groups.set(issuer.id, group);
  }

  let anyAnchored = false;
  for (const { issuer, certs } of groups.values()) {
    let signer;
    try {
      signer = getOperatorSigner(issuer);
    } catch (error) {
      console.error(`[anchor] Could not load the operator wallet for ${issuer.organizationName}:`, error);
      signer = null;
    }
    if (!signer) {
      console.warn(
        `[anchor] ${issuer.organizationName} has no usable operator wallet — leaving ${certs.length} certificate(s) PENDING.`
      );
      continue;
    }

    try {
      const contract = getSignerContract(signer);
      const tx = await contract.issueCredentialBatch(
        certs.map((c) => c.credentialId),
        certs.map((c) => c.cid as string),
        certs.map((c) => c.walletAddress as string),
        certs.map((c) => toUnixExpiry(c.expiresAt))
      );
      const receipt = await tx.wait();

      const txHash = receipt?.hash ?? tx.hash;
      try {
        await prisma.certificate.updateMany({
          where: { id: { in: certs.map((c) => c.id) } },
          data: { status: "ACTIVE", txHash },
        });
      } catch (dbError) {
        console.error(`[anchor] On-chain batch anchoring succeeded (${txHash}) but DB update failed for ${certs.length} certificates. Retrying once...`, dbError);
        try {
          await prisma.certificate.updateMany({
            where: { id: { in: certs.map((c) => c.id) } },
            data: { status: "ACTIVE", txHash },
          });
        } catch (retryError) {
          console.error(`[anchor] DB update retry also failed for batch of ${certs.length} (txHash ${txHash}). Manual recovery needed.`, retryError);
        }
      }
      anyAnchored = true;
    } catch (error) {
      console.error(`[anchor] Failed to auto-anchor batch of ${certs.length} for ${issuer.organizationName}:`, error);
    }
  }

  return anyAnchored;
}
