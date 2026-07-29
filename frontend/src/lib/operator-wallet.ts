import { Wallet, JsonRpcProvider } from "ethers";
import type { Issuer } from "@prisma/client";
import { encrypt, decrypt } from "@/lib/crypto";
import { RPC_URL } from "@/lib/config";

/**
 * Generates a fresh wallet for a newly-created Issuer to use as its
 * platform-custodied operator wallet (see the doc comment on
 * Issuer.operatorAddress in schema.prisma). The caller is responsible for
 * persisting the result and authorising `address` on-chain via
 * `authoriseInstitution` — this function only generates and encrypts.
 */
export function createOperatorWallet(): { address: string; operatorKeyEnc: string } {
  const wallet = Wallet.createRandom();
  return { address: wallet.address, operatorKeyEnc: encrypt(wallet.privateKey) };
}

/**
 * Decrypts an issuer's operator wallet into a connected signer, ready to
 * sign on-chain transactions attributed to that institution. Returns null
 * if the issuer has no operator wallet provisioned yet (e.g. it predates
 * this feature) — callers should treat that as "can't auto-anchor for
 * this issuer," not a hard error.
 */
export function getOperatorSigner(issuer: Pick<Issuer, "operatorAddress" | "operatorKeyEnc">): Wallet | null {
  if (!issuer.operatorAddress || !issuer.operatorKeyEnc) return null;
  const provider = new JsonRpcProvider(RPC_URL);
  return new Wallet(decrypt(issuer.operatorKeyEnc), provider);
}
