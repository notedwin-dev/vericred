import { prisma } from "@/lib/prisma";

export type WalletConflict = { type: "user" | "issuer"; ownerId: string } | null;

/**
 * A physical wallet address must never be ambiguously "whose wallet is
 * this" — checks both the personal-login (`User.walletAddress`) and
 * institution-identity (`Issuer.walletAddress`) tables. See
 * docs/prds/institution-registration-prd.md Decision 10.
 */
export async function findWalletConflict(normalizedAddress: string): Promise<WalletConflict> {
  const [user, issuer] = await Promise.all([
    prisma.user.findUnique({ where: { walletAddress: normalizedAddress } }),
    prisma.issuer.findUnique({ where: { walletAddress: normalizedAddress } }),
  ]);
  // Institution identity is reported first, deliberately. Callers treat a
  // "user" conflict that *is* the caller as no conflict at all ("that's my own
  // wallet, I'm just re-confirming it"), so returning the user match first hid
  // the institution collision whenever both rows held the address — which is
  // exactly how an institution's on-chain wallet ended up captured by a
  // personal account. The stronger claim has to win.
  if (issuer) return { type: "issuer", ownerId: issuer.id };
  if (user) return { type: "user", ownerId: user.id };
  return null;
}
