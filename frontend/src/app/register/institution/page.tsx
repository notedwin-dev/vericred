"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Building2, Check, Clock, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useWalletProof } from "@/hooks/use-wallet-proof";
import { REGISTER_INSTITUTION_WALLET_MESSAGE } from "@/lib/wallet-messages";

/**
 * Institution signup (docs/institution-registration-prd.md §6.3).
 *
 * No OAuth here on purpose: institutions sign in with password AND a wallet
 * signature (Decision 4), which an OAuth session can't satisfy. The wallet
 * collected here becomes the institution's on-chain issuing identity and the
 * funding source for its operator wallet (Decision 2) — not a personal one.
 */
export default function RegisterInstitutionPage() {
  const router = useRouter();
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<string | null>(null);

  const { proof, address, hasProvider, isBusy, error: walletError, requestProof } = useWalletProof(
    REGISTER_INSTITUTION_WALLET_MESSAGE
  );

  useEffect(() => {
    if (walletError) toast.error(walletError);
  }, [walletError]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    const signed = proof ?? (await requestProof());
    if (!signed) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/register/institution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName,
          email,
          username,
          password,
          confirmPassword,
          walletAddress: signed.address,
          message: signed.message,
          signature: signed.signature,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to submit registration.", { duration: 7000 });
        return;
      }

      setSubmitted(email);
      if (data.emailSent === false) {
        toast.warning("Request submitted, but we couldn't send the verification email.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-12 dark:bg-black">
        <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-5" />
          VeriCred
        </Link>
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col gap-4 pt-2 text-center">
            <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950">
              <Clock className="size-5 text-amber-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Registration submitted</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Two things happen next. First, verify{" "}
                <span className="font-medium text-foreground">{submitted}</span> using the link we just emailed you.
                Then an admin reviews your registration and authorises your wallet on-chain — we&apos;ll email you
                when that&apos;s done.
              </p>
            </div>
            <Button onClick={() => router.push("/")} variant="outline" className="h-10">
              Back to home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
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
            <Link
              href="/register"
              className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3" />
              Back
            </Link>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <Building2 className="size-5" />
              Register your institution
            </h1>
            <p className="text-sm text-muted-foreground">
              An admin reviews every registration before you can issue credentials.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="organizationName">Institution name</Label>
              <Input
                id="organizationName"
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Asia Pacific University"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Contact email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="registrar@your-institution.edu"
              />
              <p className="text-xs text-muted-foreground">
                Use your institution&apos;s own domain — personal addresses (Gmail, Outlook…) are rejected.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="apu_registry"
              />
              <p className="text-xs text-muted-foreground">
                3-32 characters: lowercase letters, numbers, hyphens, underscores.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
              <p className="text-xs text-muted-foreground">
                {hasProvider
                  ? "Use a wallet the institution controls, not a personal one — it becomes your on-chain issuing identity, you'll sign in with it every time, and it funds the gas for anchoring credentials."
                  : "No browser wallet detected. Install MetaMask to register an institution."}
              </p>
            </div>

            <Button type="submit" className="mt-1 h-10" disabled={isSubmitting || isBusy}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Submit for review"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Already registered?{" "}
            <Link href="/login/institution" className="font-medium text-foreground hover:underline">
              Institution sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
