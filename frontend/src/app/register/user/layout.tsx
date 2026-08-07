import { Web3Provider } from "@/providers/web3-provider";

/**
 * Individual signup collects a signature-verified wallet via useWalletProof,
 * which reads Web3Provider's context. Mounted here rather than in the root
 * layout so wallet-free routes don't compile ethers — see
 * docs/dev-performance.md.
 */
export default function RegisterUserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Web3Provider>{children}</Web3Provider>;
}
