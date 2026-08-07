import type { Role } from "@/types";

/**
 * Whether an authenticated account still has to complete signup.
 *
 * The direct registration forms collect a username and a signature-verified
 * wallet up front, but OAuth has no form step during its redirect callback —
 * Auth.js's PrismaAdapter just creates the account. Those accounts finish at
 * /onboarding instead (docs/prds/institution-registration-prd.md Decision 9).
 *
 * Institution (ISSUER) and platform (ADMIN) accounts are exempt: an
 * institution's wallet is its on-chain identity on the `Issuer` record, not a
 * personal `User.walletAddress`, so requiring one here would trap them in a
 * gate they can never satisfy.
 */
export function needsOnboarding(user: {
  role: Role;
  username: string | null;
  walletAddress: string | null;
}): boolean {
  if (user.role !== "USER") {
    return false;
  }
  return !user.username || !user.walletAddress;
}
