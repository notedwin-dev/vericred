import type { Certificate, Issuer } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAdminSigner, getReadOnlyContract, getSignerContract } from "@/lib/contract";
import { getOperatorSigner } from "@/lib/operator-wallet";

/**
 * Anchors a revocation on-chain.
 *
 * Revocation used to be recorded in the off-chain index only: the issuer panel
 * PATCHed `status: "REVOKED"` into Postgres and nothing ever called
 * `revokeCredential`. A revoked credential's on-chain `isValid()` therefore
 * still returned true, and the "Revoked" verdict a verifier saw came entirely
 * from the off-chain cross-check in `/api/verify/[credentialId]`. That put the
 * one fact most worth making tamper-proof in the one store that is mutable.
 *
 * Picking the signer is the whole difficulty. `VeriCred.sol` requires
 * `msg.sender` to be either the credential's on-chain `issuer` or the admin,
 * and the issuer is whichever wallet actually anchored it:
 *
 *  - anchored interactively  -> the institution's own wallet (Issuer.walletAddress),
 *    whose key the platform never holds, so the server cannot sign as it;
 *  - anchored by lib/anchor.ts -> that institution's operator wallet, whose key
 *    the platform does hold, encrypted.
 *
 * So the on-chain issuer is read back from the chain rather than assumed, and
 * the operator wallet is used when it matches. Otherwise we fall back to the
 * admin signer, which the contract accepts for any credential — that is the
 * override authority admin is documented to have, and it is the only way to
 * revoke a credential an institution anchored from a browser wallet.
 *
 * Never throws. A revocation that cannot be anchored must still be recorded
 * off-chain rather than failing the issuer's request outright, so the caller
 * gets a result to report instead of an exception to swallow.
 */

export type RevokeOnChainResult =
  | { status: "revoked"; txHash: string }
  | { status: "skipped"; reason: "not-anchored" | "already-revoked" | "no-signer" }
  | { status: "failed"; message: string };

type RevocableCertificate = Pick<Certificate, "credentialId" | "txHash" | "courseId">;

/** The chain's view of a credential, or null if it was never anchored. */
async function readOnChain(
  credentialId: string
): Promise<{ issuer: string; revoked: boolean } | null> {
  try {
    const contract = getReadOnlyContract();
    const credential = await contract.getCredential(credentialId);
    return { issuer: String(credential.issuer), revoked: Boolean(credential.revoked) };
  } catch {
    // getCredential reverts with CredentialNotFound for anything never
    // anchored. Treat any read failure as "nothing to revoke on-chain" — the
    // caller still records the revocation off-chain either way.
    return null;
  }
}

/**
 * Resolves a signer permitted to revoke this credential, preferring the
 * institution's own operator wallet over the platform admin key so the
 * revocation is attributed to the institution wherever possible.
 */
function resolveRevoker(issuer: Issuer | null, onChainIssuer: string) {
  if (issuer?.operatorAddress && issuer.operatorAddress.toLowerCase() === onChainIssuer.toLowerCase()) {
    try {
      const operator = getOperatorSigner(issuer);
      if (operator) return operator;
    } catch (error) {
      // A corrupt operatorKeyEnc makes decrypt() throw. That is a reason to
      // fall through to the admin signer, not to abort the revocation.
      console.error(`[revoke] Could not load the operator wallet for ${issuer.organizationName}:`, error);
    }
  }
  return getAdminSigner();
}

export async function revokeCertificateOnChain(
  certificate: RevocableCertificate,
  reason: string
): Promise<RevokeOnChainResult> {
  // Never anchored: there is no on-chain record to append a revocation to.
  // This is the common case for PENDING and CLAIMED certificates and is not
  // a failure.
  if (!certificate.txHash) {
    return { status: "skipped", reason: "not-anchored" };
  }

  const onChain = await readOnChain(certificate.credentialId);
  if (!onChain) {
    return { status: "skipped", reason: "not-anchored" };
  }
  if (onChain.revoked) {
    // Already revoked on-chain — the contract would revert with
    // CredentialAlreadyRevoked. Converging on the desired state, so report it
    // as a skip rather than an error.
    return { status: "skipped", reason: "already-revoked" };
  }

  const course = await prisma.course.findUnique({
    where: { id: certificate.courseId },
    include: { issuer: true },
  });
  const signer = resolveRevoker(course?.issuer ?? null, onChain.issuer);
  if (!signer) {
    console.warn(
      `[revoke] No signer available to revoke ${certificate.credentialId} on-chain ` +
        `(anchored by ${onChain.issuer}; ADMIN_PRIVATE_KEY unset and no matching operator wallet).`
    );
    return { status: "skipped", reason: "no-signer" };
  }

  try {
    const contract = getSignerContract(signer);
    const tx = await contract.revokeCredential(certificate.credentialId, reason);
    const receipt = await tx.wait();
    return { status: "revoked", txHash: receipt?.hash ?? tx.hash };
  } catch (error) {
    console.error(`[revoke] Failed to revoke ${certificate.credentialId} on-chain:`, error);
    return { status: "failed", message: error instanceof Error ? error.message : String(error) };
  }
}
