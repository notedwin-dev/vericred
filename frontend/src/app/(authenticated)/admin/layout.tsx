import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Web3Provider } from "@/providers/web3-provider";

/**
 * The institutions panel signs authorise/remove transactions through
 * useContract, which reads Web3Provider's context. Scoped to /admin rather
 * than the shared (authenticated) layout so /dashboard doesn't compile ethers
 * — see docs/prds/dev-performance.md.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return <Web3Provider>{children}</Web3Provider>;
}
