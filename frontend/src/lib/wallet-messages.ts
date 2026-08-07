/**
 * The exact strings users are asked to sign, shared between the forms that
 * request a signature and anything that needs to describe it. Signatures are
 * verified by recovering the signer address (`ethers.verifyMessage`), so the
 * server doesn't parse these — but keeping them here means a user reading a
 * MetaMask prompt sees a consistent, intelligible sentence rather than
 * whichever wording a given form happened to hardcode.
 */
export const INSTITUTION_SIGN_IN_MESSAGE = "Sign in to VeriCred as an institution.";

export const REGISTER_WALLET_MESSAGE = "Link this wallet to my new VeriCred account.";

export const REGISTER_INSTITUTION_WALLET_MESSAGE =
  "Register this wallet as my institution's on-chain identity on VeriCred.";

export const ONBOARDING_WALLET_MESSAGE = "Link this wallet to my VeriCred account.";

export const CHANGE_INSTITUTION_WALLET_MESSAGE =
  "Set this wallet as my institution's on-chain identity on VeriCred.";
