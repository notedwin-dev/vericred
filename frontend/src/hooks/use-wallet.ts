"use client";

import { useWeb3Context } from "@/providers/web3-provider";
import { formatAddress } from "@/lib/utils";

/**
 * Client hook exposing the connected wallet's state (address, chain, connect
 * / disconnect actions). Thin wrapper around the Web3Provider context so
 * components don't need to import the provider directly.
 */
export function useWallet() {
  const ctx = useWeb3Context();

  return {
    ...ctx,
    shortAddress: formatAddress(ctx.address),
  };
}
