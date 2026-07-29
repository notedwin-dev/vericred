"use client";

import { useCallback, useMemo } from "react";
import { Contract, JsonRpcProvider, type InterfaceAbi } from "ethers";
import { CONTRACT_ADDRESS, RPC_URL } from "@/lib/config";
import { useWeb3Context } from "@/providers/web3-provider";

let abi: InterfaceAbi = [];
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  abi = require("@/lib/abi.json");
} catch {
  abi = [];
}

/**
 * Client-side contract access. `readOnlyContract` works everywhere (backed
 * by a plain JSON-RPC provider, no wallet needed) for view/pure calls.
 * `getWriteContract()` resolves a contract instance connected to the
 * connected wallet's signer for state-changing calls, throwing a friendly
 * error if no wallet is connected.
 */
export function useContract() {
  const { getSigner, isConnected } = useWeb3Context();

  const readOnlyContract = useMemo(() => {
    if (!CONTRACT_ADDRESS) return null;
    const provider = new JsonRpcProvider(RPC_URL);
    return new Contract(CONTRACT_ADDRESS, abi, provider);
  }, []);

  const getWriteContract = useCallback(async () => {
    if (!CONTRACT_ADDRESS) {
      throw new Error("Contract address is not configured.");
    }
    if (!isConnected) {
      throw new Error("Connect your wallet to perform this action.");
    }
    const signer = await getSigner();
    return new Contract(CONTRACT_ADDRESS, abi, signer);
  }, [getSigner, isConnected]);

  return { readOnlyContract, getWriteContract };
}
