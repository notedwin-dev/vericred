"use client";

import { getCsrfToken, getSession, signIn, signOut } from "next-auth/react";
import { SiweMessage } from "siwe";
import { getAddress } from "ethers";
import {
  createSIWEConfig,
  type SIWECreateMessageArgs,
  type SIWESession,
  type SIWEVerifyMessageArgs,
} from "@reown/appkit-siwe";
import { CHAIN_ID } from "@/lib/config";

const STATEMENT = "Sign in to VeriCred with your wallet.";

export const siweConfig = createSIWEConfig({
  getMessageParams: async () => ({
    domain: typeof window !== "undefined" ? window.location.host : "",
    uri: typeof window !== "undefined" ? window.location.origin : "",
    chains: [CHAIN_ID],
    statement: STATEMENT,
  }),
  createMessage: ({ nonce, address, chainId }: SIWECreateMessageArgs) =>
    new SiweMessage({
      version: "1",
      domain: window.location.host,
      uri: window.location.origin,
      address: getAddress(address.split(":").pop()!),
      chainId,
      nonce,
      statement: STATEMENT,
      issuedAt: new Date().toISOString(),
    }).prepareMessage(),
  getNonce: async () => {
    const nonce = await getCsrfToken();
    if (!nonce) {
      throw new Error("Failed to get nonce");
    }
    return nonce;
  },
  getSession: async () => {
    const session = await getSession();
    if (!session?.user?.walletAddress) {
      return null;
    }
    return {
      address: session.user.walletAddress,
      chainId: CHAIN_ID,
    } satisfies SIWESession;
  },
  verifyMessage: async ({ message, signature }: SIWEVerifyMessageArgs) => {
    try {
      const result = await signIn("wallet", {
        message,
        signature,
        redirect: false,
      });
      return Boolean(result?.ok);
    } catch {
      return false;
    }
  },
  signOut: async () => {
    try {
      await signOut({ redirect: false });
      return true;
    } catch {
      return false;
    }
  },
});
