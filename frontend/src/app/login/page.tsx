"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
// Lazy: this route must not compile @reown/appkit before it can render.
// See components/auth/walletconnect-sign-in.tsx.
import { WalletConnectSignIn } from "@/components/auth/walletconnect-sign-in";
import { toast } from "sonner";
import { ShieldCheck, Loader2, MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { GitHubIcon, GoogleIcon, LinkedInIcon } from "@/components/icons/brand-icons";

/** Only allow same-origin relative paths, rejecting protocol-relative (`//evil.com`) and absolute URLs. */
function getSafeCallbackUrl(value: string | null): string {
  if (value && /^\/(?!\/)/.test(value)) {
    return value;
  }
  return "/dashboard";
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const callbackUrl = getSafeCallbackUrl(searchParams.get("callbackUrl"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.push(callbackUrl);
      router.refresh();
    }
  }, [status, callbackUrl, router]);

  // The email-verification link (/api/user/email/verify) lands here for
  // accounts verifying at registration time, since they aren't signed in yet.
  useEffect(() => {
    if (searchParams.get("emailVerified")) {
      toast.success("Email verified. You can sign in now.");
      router.replace("/login");
    } else if (searchParams.get("emailError")) {
      toast.error("That verification link is invalid or has expired. Request a new one below.");
      setNeedsVerification(true);
      router.replace("/login");
    }
  }, [searchParams, router]);

  useEffect(() => {
    const error = searchParams.get("error");
    if (!error) return;

    if (error === "OAuthAccountNotLinked") {
      toast.error(
        "That email is already used by an existing VeriCred account. Sign in with your original method, then link this provider from Settings.",
        { duration: 8000 }
      );
    } else if (error === "AccountAlreadyLinked") {
      toast.error("That account is already linked to a different VeriCred account.");
    } else {
      toast.error("Sign in failed. Please try again.");
    }
    const params = new URLSearchParams(searchParams);
    params.delete("error");
    router.replace(params.size ? `/login?${params}` : "/login");
  }, [searchParams, router]);

  async function handleCredentialsSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        // lib/auth-credentials.ts throws EmailNotVerifiedError for an account
        // that authenticated correctly but has never proven its email.
        if ((result as { code?: string }).code === "EmailNotVerified") {
          setNeedsVerification(true);
          toast.error("Please verify your email address before signing in.");
        } else {
          toast.error("Invalid email or password.");
        }
        return;
      }

      toast.success("Signed in successfully.");
      router.push(callbackUrl);
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendVerification() {
    if (!email) {
      toast.error("Enter your email address first.");
      return;
    }
    setIsResending(true);
    try {
      const res = await fetch("/api/auth/verify-email/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not send a verification email.");
        return;
      }
      toast.success(data.message);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsResending(false);
    }
  }

  async function handleOAuth(provider: "github" | "google" | "linkedin") {
    setOauthLoading(provider);
    try {
      await signIn(provider, { callbackUrl });
    } finally {
      setOauthLoading(null);
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
            <h1 className="text-xl font-semibold">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Sign in to manage your credentials.</p>
          </div>

          {/* WalletConnect — primary sign-in method */}
          <WalletConnectSignIn />

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or continue with</span>
            <Separator className="flex-1" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-0"
              disabled={!!oauthLoading}
              onClick={() => handleOAuth("github")}
              aria-label="Continue with GitHub"
            >
              {oauthLoading === "github" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <GitHubIcon className="size-4" />
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-0"
              disabled={!!oauthLoading}
              onClick={() => handleOAuth("google")}
              aria-label="Continue with Google"
            >
              {oauthLoading === "google" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <GoogleIcon className="size-4" />
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 gap-0"
              disabled={!!oauthLoading}
              onClick={() => handleOAuth("linkedin")}
              aria-label="Continue with LinkedIn"
            >
              {oauthLoading === "linkedin" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LinkedInIcon className="size-4" />
              )}
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or email</span>
            <Separator className="flex-1" />
          </div>

          <form onSubmit={handleCredentialsSubmit} className="flex flex-col gap-3">
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
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="mt-1 h-10" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Sign In"}
            </Button>
          </form>

          {needsVerification && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
              <p className="flex items-start gap-2 font-medium">
                <MailWarning className="mt-0.5 size-4 shrink-0" />
                Verify your email to continue
              </p>
              <p className="mt-1 text-muted-foreground">
                We sent a link to your inbox when you signed up. It expires after an hour.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 h-8 w-full"
                disabled={isResending}
                onClick={handleResendVerification}
              >
                {isResending ? <Loader2 className="size-4 animate-spin" /> : "Resend verification email"}
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-1 text-center text-sm text-muted-foreground">
            <p>
              Don&apos;t have an account?{" "}
              <Link href="/register" className="font-medium text-foreground hover:underline">
                Sign up
              </Link>
            </p>
            <p>
              Signing in as an institution?{" "}
              <Link href="/login/institution" className="font-medium text-foreground hover:underline">
                Use the institution form
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
