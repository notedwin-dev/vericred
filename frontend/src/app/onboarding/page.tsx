import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { needsOnboarding } from "@/lib/onboarding";
import { OnboardingForm } from "./onboarding-form";

/**
 * Finishes signup for accounts created by an OAuth callback, which never saw
 * a registration form (docs/institution-registration-prd.md Decision 9).
 *
 * Lives outside the `(authenticated)` route group on purpose: that layout
 * redirects *here* when onboarding is incomplete, so being inside it would
 * loop forever.
 */
export default async function OnboardingPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }
  if (!needsOnboarding(session.user)) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck className="size-5" />
        VeriCred
      </Link>
      <OnboardingForm
        initialUsername={session.user.username ?? ""}
        hasWallet={Boolean(session.user.walletAddress)}
      />
    </div>
  );
}
