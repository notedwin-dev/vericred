/**
 * Maps VeriCred's Solidity custom errors to user-friendly messages.
 *
 * Ethers v6 surfaces a revert from a custom error as an error whose
 * `.shortMessage`/`.reason` (or nested `.info.error.message` / `.data`)
 * contains the error's name, e.g. "CredentialAlreadyExists". This module
 * pattern-matches on that name (wherever it shows up in the thrown error)
 * and returns copy suitable for display in the UI.
 */

export const CONTRACT_ERROR_MESSAGES: Record<string, string> = {
  // ── Access control ──────────────────────────────────────────────
  NotAdmin: "Only the contract admin can perform this action.",
  NotAuthorisedInstitution:
    "This wallet is not authorised to issue credentials.",
  NotIssuerOrAdmin:
    "Only the issuing institution or the admin can revoke this credential.",
  NotRecipientOrAdmin:
    "Only the credential's recipient or the admin can perform this action.",

  // ── Credential lifecycle ────────────────────────────────────────
  CredentialAlreadyExists: "A credential with this ID has already been issued.",
  CredentialNotFound: "No credential was found with this ID.",
  CredentialAlreadyRevoked: "This credential has already been revoked.",

  // ── Validation ───────────────────────────────────────────────────
  EmptyCredentialId: "The credential ID cannot be empty.",
  EmptyCid: "The IPFS CID cannot be empty.",
  EmptyReason: "A reason is required to revoke a credential.",
  ZeroAddress: "The zero address is not a valid wallet address.",
  ZeroRecipient: "A recipient address is required.",
  LengthMismatch: "The provided arrays must be the same length.",
  SelfTransfer: "You cannot transfer to the same address.",
  InvalidExpiryDate: "The expiry date must be in the future.",
};

const GENERIC_MESSAGE = "Something went wrong while talking to the contract. Please try again.";

const USER_REJECTED_MESSAGE = "Transaction was rejected in your wallet.";

/**
 * Best-effort extraction of a Solidity custom error name (or a handful of
 * common ethers/provider error shapes) from an arbitrary thrown value, and
 * translation into a message safe to show a user.
 */
export function parseContractError(error: unknown): string {
  if (!error) return GENERIC_MESSAGE;

  // User rejected the transaction in their wallet (MetaMask code 4001, or
  // ethers' ACTION_REJECTED code).
  const code = (error as { code?: string | number })?.code;
  if (code === 4001 || code === "ACTION_REJECTED") {
    return USER_REJECTED_MESSAGE;
  }

  // Collect every string we can find on the error object that might contain
  // the custom error name, then test each known name against all of them.
  const candidates: string[] = [];
  const err = error as Record<string, unknown>;

  const pushIfString = (value: unknown) => {
    if (typeof value === "string") candidates.push(value);
  };

  pushIfString(err?.shortMessage);
  pushIfString(err?.reason);
  pushIfString(err?.message);
  pushIfString((err?.info as Record<string, unknown> | undefined)?.error);
  pushIfString(
    ((err?.info as Record<string, unknown> | undefined)?.error as Record<string, unknown> | undefined)
      ?.message
  );
  pushIfString(err?.data);
  pushIfString((err?.error as Record<string, unknown> | undefined)?.message);

  if (error instanceof Error) candidates.push(error.message);

  for (const [name, message] of Object.entries(CONTRACT_ERROR_MESSAGES)) {
    if (candidates.some((c) => c.includes(name))) {
      return message;
    }
  }

  // Fall back to insufficient funds / network-level errors with a slightly
  // more specific message than the generic fallback.
  if (candidates.some((c) => /insufficient funds/i.test(c))) {
    return "Your wallet does not have enough funds to complete this transaction.";
  }
  if (candidates.some((c) => /network|timeout|fetch failed/i.test(c))) {
    return "Could not reach the blockchain network. Check your connection and try again.";
  }

  return GENERIC_MESSAGE;
}
