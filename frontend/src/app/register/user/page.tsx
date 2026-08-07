"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
// Lazy: this route must not compile @reown/appkit before it can render.
// See components/auth/walletconnect-sign-in.tsx.
import { WalletConnectSignIn } from "@/components/auth/walletconnect-sign-in";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { GitHubIcon, GoogleIcon, LinkedInIcon } from "@/components/icons/brand-icons";
import { useWalletProof } from "@/hooks/use-wallet-proof";
import { REGISTER_WALLET_MESSAGE } from "@/lib/wallet-messages";

/**
 * Individual signup (docs/prds/institution-registration-prd.md 6.1). Username and
 * a signature-verified wallet are required here, same as every other path
 * (Decision 9) — OAuth signups collect the same two things at /onboarding
 * instead, since their callback has no form step.
 */
export default function RegisterUserPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [registered, setRegistered] = useState<string | null>(null);

  const { proof, address, hasProvider, isBusy, error: walletError, requestProof } =
    useWalletProof(REGISTER_WALLET_MESSAGE);

  useEffect(() => {
    if (walletError) toast.error(walletError);
  }, [walletError]);

  async function handleOAuth(provider: "github" | "google" | "linkedin") {
    setOauthLoading(provider);
    try {
      // Lands on /onboarding, which collects the username + wallet this form
      // would have collected directly.
      await signIn(provider, { callbackUrl: "/onboarding" });
    } finally {
      setOauthLoading(null);
    }
  }

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
      const res = await fetch("/api/auth/register/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          username,
          email,
          password,
          confirmPassword,
          walletAddress: signed.address,
          message: signed.message,
          signature: signed.signature,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to create account.");
        return;
      }

      // No auto sign-in: login is blocked until the email is verified
      // (Decision 5), so send them to check their inbox instead.
      setRegistered(email);
      if (data.emailSent === false) {
        toast.warning("Account created, but we couldn't send the verification email. Try resending from sign in.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (registered) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-12 dark:bg-black">
        <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-5" />
          VeriCred
        </Link>
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col gap-4 pt-2 text-center">
            <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
              <Check className="size-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Check your inbox</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                We sent a verification link to <span className="font-medium text-foreground">{registered}</span>. You
                need to confirm it before you can sign in — the link expires in an hour.
              </p>
            </div>
            <Button onClick={() => router.push("/login")} className="h-10">
              Go to sign in
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
            <h1 className="text-xl font-semibold">Create your account</h1>
            <p className="text-sm text-muted-foreground">
              Collect and share credentials issued to you.
            </p>
          </div>

          <WalletConnectSignIn />

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or continue with</span>
            <Separator className="flex-1" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["github", GitHubIcon, "GitHub"],
                ["google", GoogleIcon, "Google"],
                ["linkedin", LinkedInIcon, "LinkedIn"],
              ] as const
            ).map(([provider, Icon, label]) => (
              <Button
                key={provider}
                type="button"
                variant="outline"
                className="h-10 gap-0"
                disabled={!!oauthLoading}
                onClick={() => handleOAuth(provider)}
                aria-label={`Continue with ${label}`}
              >
                {oauthLoading === provider ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Icon className="size-4" />
                )}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or email</span>
            <Separator className="flex-1" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ada_lovelace"
              />
              <p className="text-xs text-muted-foreground">
                3-32 characters: lowercase letters, numbers, hyphens, underscores.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
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
              <Label>Wallet</Label>
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
                  ? "Your credentials are issued to this address, so we ask you to sign a message proving it's yours."
                  : "No browser wallet detected. Install MetaMask to continue."}
              </p>
            </div>

            <Button type="submit" className="mt-1 h-10" disabled={isSubmitting || isBusy}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Create Account"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-foreground hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

