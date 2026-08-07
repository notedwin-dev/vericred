"use client";

import { useCallback, useEffect, useState } from "react";
import { useWeb3Context } from "@/providers/web3-provider";

export interface WalletProof {
  address: string;
  message: string;
  signature: string;
}

/**
 * "Connect a wallet and prove you control it" as a *form field* — the shape
 * every signature-gated form needs (registration, institution sign-in,
 * OAuth onboarding, changing an institution's wallet).
 *
 * Deliberately uses the injected-provider context rather than AppKit, even
 * though AppKit is the app's usual identity surface: AppKit is configured
 * with `siweConfig`, so opening its modal *immediately* establishes a
 * NextAuth session for whatever wallet is connected. That's right for
 * "sign in with your wallet" and wrong here — a registration form has no
 * account yet, and the institution sign-in form must not hand out a session
 * before the password has also been checked.
 */
export function useWalletProof(message: string) {
  const { address, connect, getSigner, hasProvider, isConnecting } = useWeb3Context();
  const [proof, setProof] = useState<WalletProof | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A proof is only valid for the account that produced it — switching
  // wallets in MetaMask must invalidate it rather than silently submit the
  // old address alongside the new connection.
  useEffect(() => {
    setProof((current) =>
      current && address && current.address.toLowerCase() === address.toLowerCase() ? current : null
    );
  }, [address]);

  const requestProof = useCallback(async () => {
    setError(null);
    setIsSigning(true);
    try {
      if (!hasProvider) {
        throw new Error("No wallet detected. Install MetaMask or another browser wallet to continue.");
      }

      const connected = address ?? (await connect());
      if (!connected) {
        throw new Error("Wallet connection was cancelled.");
      }

      const signer = await getSigner();
      const signature = await signer.signMessage(message);
      const signed: WalletProof = { address: await signer.getAddress(), message, signature };
      setProof(signed);
      return signed;
    } catch (err) {
      const reason =
        err instanceof Error && err.message ? err.message : "Could not get a signature from your wallet.";
      setError(reason);
      return null;
    } finally {
      setIsSigning(false);
    }
  }, [address, connect, getSigner, hasProvider, message]);

  return {
    /** The connected address, whether or not it has signed yet. */
    address,
    /** Set once the connected wallet has signed `message`. */
    proof,
    hasProvider,
    isBusy: isConnecting || isSigning,
    error,
    requestProof,
  };
}
