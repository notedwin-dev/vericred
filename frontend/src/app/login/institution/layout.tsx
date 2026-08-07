import { Web3Provider } from "@/providers/web3-provider";

/**
 * Institution sign-in requires a password *and* a fresh wallet signature on
 * every login, taken via useWalletProof, which reads Web3Provider's context.
 * Mounted here rather than in the root layout so wallet-free routes don't
 * compile ethers — see docs/prds/dev-performance.md.
 */
export default function LoginInstitutionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Web3Provider>{children}</Web3Provider>;
}
