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

/**
 * Importing this module is what runs `createAppKit()` — the component below
 * renders nothing. Every file that calls `useAppKit`, `useAppKitAccount` or
 * `useDisconnect` (directly or through `useAppKitWallet`) must therefore import
 * this module itself, so that initialisation and use sit in the same chunk and
 * cannot race. There are only three such files:
 *
 *   - components/auth/walletconnect-sign-in-button.tsx  (/login, /register/user)
 *   - components/layout/appkit-profile-dropdown.tsx     ((authenticated) navbar)
 *   - components/dashboard/appkit-wallet-section.tsx    (/dashboard/settings)
 *
 * Both are reached exclusively through `next/dynamic`, and both must stay that
 * way. Side-effect-on-import is also why this is *not* in the root layout: any
 * route inheriting a layout that imports it pays to compile the whole AppKit +
 * Lit graph, even a static marketing page. See docs/prds/dev-performance.md.
 *
 * The exported component is a no-op kept only so a consumer can express "AppKit
 * is initialised below here" in JSX. Importing the module is the part that
 * matters; wrapping is optional.
 */
export function AppKitProvider({ children }: { children: React.ReactNode }) {
  return children;
}
