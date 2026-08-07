import { Web3Provider } from "@/providers/web3-provider";

/**
 * The onboarding form signs a wallet proof via useWalletProof, which reads
 * Web3Provider's context. The provider lives here rather than in the root
 * layout so routes without a wallet step don't compile ethers — see
 * docs/dev-performance.md.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Web3Provider>{children}</Web3Provider>;
}
