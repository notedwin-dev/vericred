"use client";

import { createAppKit } from "@reown/appkit/react";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { defineChain } from "@reown/appkit/networks";
import { CHAIN_ID, RPC_URL } from "@/lib/config";
import { siweConfig } from "@/lib/siwe-config";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

const hardhatLocalhost = defineChain({
  id: CHAIN_ID,
  caipNetworkId: `eip155:${CHAIN_ID}`,
  chainNamespace: "eip155",
  name: CHAIN_ID === 31337 ? "Hardhat Localhost" : `Chain ${CHAIN_ID}`,
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  testnet: true,
});

const metadata = {
  name: "VeriCred",
  description: "Blockchain-based Academic Credential Verification",
  url: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
  icons: [],
};

if (projectId) {
  createAppKit({
    adapters: [new EthersAdapter()],
    networks: [hardhatLocalhost],
    metadata,
    projectId,
    siweConfig,
    features: {
      analytics: false,
      email: false,
      socials: false,
      swaps: false,
      onramp: false,
    },
  });
}

export function AppKitProvider({ children }: { children: React.ReactNode }) {
  return children;
}
