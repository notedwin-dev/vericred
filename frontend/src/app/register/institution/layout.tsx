import { Web3Provider } from "@/providers/web3-provider";

/**
 * Institution signup collects a signature from the organisation wallet via
 * useWalletProof, which reads Web3Provider's context. Mounted here rather than
 * in the root layout so wallet-free routes don't compile ethers — see
 * docs/dev-performance.md.
 */
export default function RegisterInstitutionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Web3Provider>{children}</Web3Provider>;
}
