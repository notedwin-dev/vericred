import type { Certificate, Issuer } from "@prisma/client";
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

/** Anchors a single PENDING certificate that now has a wallet address. */
export async function autoAnchorCertificate(certificate: AnchorableCertificate): Promise<boolean> {
  if (!certificate.cid || !certificate.walletAddress) return false;

  const issuer = await resolveIssuer(certificate.courseId);
  if (!issuer) return false;

  const signer = getOperatorSigner(issuer);
  if (!signer) {
    console.warn(
      `[anchor] ${issuer.organizationName} has no operator wallet provisioned — leaving ${certificate.credentialId} PENDING.`
    );
    return false;
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

    await prisma.certificate.update({
      where: { id: certificate.id },
      data: { status: "ACTIVE", txHash: receipt?.hash ?? tx.hash },
    });
    return true;
  } catch (error) {
    console.error(`[anchor] Failed to auto-anchor ${certificate.credentialId}:`, error);
    return false;
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
  const anchorable = certificates.filter((c) => c.cid && c.walletAddress);
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
    const signer = getOperatorSigner(issuer);
    if (!signer) {
      console.warn(
        `[anchor] ${issuer.organizationName} has no operator wallet provisioned — leaving ${certs.length} certificate(s) PENDING.`
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

      await prisma.certificate.updateMany({
        where: { id: { in: certs.map((c) => c.id) } },
        data: { status: "ACTIVE", txHash: receipt?.hash ?? tx.hash },
      });
      anyAnchored = true;
    } catch (error) {
      console.error(`[anchor] Failed to auto-anchor batch of ${certs.length} for ${issuer.organizationName}:`, error);
    }
  }

  return anyAnchored;
}
