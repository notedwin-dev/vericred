"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { toast } from "sonner";
import { Building2, Check, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useWalletProof } from "@/hooks/use-wallet-proof";
import { INSTITUTION_SIGN_IN_MESSAGE } from "@/lib/wallet-messages";

/** Only allow same-origin relative paths, rejecting protocol-relative (`//evil.com`) and absolute URLs. */
function getSafeCallbackUrl(value: string | null): string {
  if (value && /^\/(?!\/)/.test(value)) {
    return value;
  }
  return "/issuer";
}

/**
 * Institution sign-in requires password AND wallet signature together
 * (docs/prds/institution-registration-prd.md Decision 4), so it gets its own form
 * rather than another button on /login.
 */
export default function InstitutionLoginPage() {
  return (
    <Suspense>
      <InstitutionLoginForm />
    </Suspense>
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  EmailNotVerified: "Verify your institution's contact email before signing in. Check your inbox for the link.",
  NotAnInstitution: "That account isn't registered as an institution. Use the regular sign-in page instead.",
  InstitutionWalletRequired: "Connect and sign with your institution's wallet to continue.",
  InstitutionWalletMismatch:
    "That wallet isn't the one registered to this institution. Connect the institution's on-chain wallet and try again.",
  InstitutionPending: "Your registration is still awaiting admin approval. We'll email you as soon as it's reviewed.",
  InstitutionRejected: "This institution registration was rejected. Contact VeriCred support for details.",
};

function InstitutionLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const callbackUrl = getSafeCallbackUrl(searchParams.get("callbackUrl"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { proof, address, hasProvider, isBusy, error: walletError, requestProof } =
    useWalletProof(INSTITUTION_SIGN_IN_MESSAGE);

  useEffect(() => {
    if (status === "authenticated") {
      router.push(callbackUrl);
      router.refresh();
    }
  }, [status, callbackUrl, router]);

  useEffect(() => {
    if (walletError) toast.error(walletError);
  }, [walletError]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    // Sign at submit time if they haven't already, so the common path is
    // fill-in-and-submit rather than a mandatory two-step dance.
    const signed = proof ?? (await requestProof());
    if (!signed) return;

    setIsSubmitting(true);
    try {
      const result = await signIn("institution", {
        email,
        password,
        message: signed.message,
        signature: signed.signature,
        redirect: false,
      });

      if (result?.error) {
        const code = (result as { code?: string }).code;
        toast.error((code && ERROR_MESSAGES[code]) || "Invalid email or password.", { duration: 7000 });
        return;
      }

      toast.success("Signed in.");
      router.push(callbackUrl);
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck className="size-5" />
        VeriCred
      </Link>

      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-5 pt-2">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <Building2 className="size-5" />
              Institution sign in
            </h1>
            <p className="text-sm text-muted-foreground">
              Institutions sign in with their password <em>and</em> their registered on-chain wallet.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Contact email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Institution wallet</Label>
              <Button
                type="button"
                variant={proof ? "outline" : "secondary"}
                className="h-10 justify-start gap-2 font-mono text-xs"
                disabled={isBusy || !hasProvider}
                onClick={() => requestProof()}
              >
                {isBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : proof ? (
                  <Check className="size-4 text-emerald-600" />
                ) : (
                  <Wallet className="size-4" />
                )}
                {proof
                  ? `${proof.address.slice(0, 6)}…${proof.address.slice(-4)} signed`
                  : address
                    ? `Sign with ${address.slice(0, 6)}…${address.slice(-4)}`
                    : "Connect & sign"}
              </Button>
              {!hasProvider && (
                <p className="text-xs text-muted-foreground">
                  No browser wallet detected. Install MetaMask to sign in as an institution.
                </p>
              )}
            </div>

            <Button type="submit" className="mt-1 h-10" disabled={isSubmitting || isBusy}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Sign In"}
            </Button>
          </form>

          <div className="flex flex-col gap-1 text-center text-sm text-muted-foreground">
            <p>
              Not an institution?{" "}
              <Link href="/login" className="font-medium text-foreground hover:underline">
                Regular sign in
              </Link>
            </p>
            <p>
              Want to issue credentials?{" "}
              <Link href="/register/institution" className="font-medium text-foreground hover:underline">
                Register your institution
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
