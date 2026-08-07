import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Web3Provider } from "@/providers/web3-provider";

/**
 * The issue-certificate dialog signs issueCredential through useContract,
 * which reads Web3Provider's context. Scoped to /issuer rather than the shared
 * (authenticated) layout so /dashboard doesn't compile ethers — see
 * docs/prds/dev-performance.md.
 */
export default async function IssuerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user || (session.user.role !== "ISSUER" && session.user.role !== "ADMIN")) {
    redirect("/dashboard");
  }

  return <Web3Provider>{children}</Web3Provider>;
}
