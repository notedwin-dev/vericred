"use client";

import { createWeb3Modal, defaultConfig } from "@web3modal/ethers/react";
import { CHAIN_ID, RPC_URL } from "@/lib/config";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

const hardhatLocalhost = {
  chainId: CHAIN_ID,
  name: CHAIN_ID === 31337 ? "Hardhat Localhost" : `Chain ${CHAIN_ID}`,
  currency: "ETH",
  explorerUrl: "https://etherscan.io",
  rpcUrl: RPC_URL,
};

const metadata = {
  name: "VeriCred",
  description: "Blockchain-based Academic Credential Verification",
  url: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
  icons: [],
};

const ethersConfig = defaultConfig({
  metadata,
  enableEIP6963: true,
  enableInjected: true,
  enableCoinbase: false,
  rpcUrl: RPC_URL,
  defaultChainId: CHAIN_ID,
});

if (projectId) {
  createWeb3Modal({
    ethersConfig,
    chains: [hardhatLocalhost],
    projectId,
    enableAnalytics: false,
  });
}

export function AppKitProvider({ children }: { children: React.ReactNode }) {
  return children;
}
