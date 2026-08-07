import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { needsOnboarding } from "@/lib/onboarding";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
// No AppKitProvider here on purpose. The only consumers in this subtree are
// the navbar's avatar menu and /dashboard/settings, and both now load AppKit
// lazily in their own chunk (which carries createAppKit with it). Mounting a
// provider here instead would put the whole AppKit + Lit graph back into every
// authenticated route's compilation unit — ~20s of dev compile on /dashboard
// and /issuer. See docs/dev-performance.md.

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // OAuth accounts skip the registration form entirely, so they finish
  // choosing a username and linking a wallet here (Decision 9). /onboarding
  // deliberately sits outside this route group, or this would loop.
  if (needsOnboarding(session.user)) {
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
      <Footer />
    </div>
  );
}
