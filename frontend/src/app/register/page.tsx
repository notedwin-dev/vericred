"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useAppKit } from "@reown/appkit/react";
import { toast } from "sonner";
import { ShieldCheck, Wallet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { GitHubIcon, GoogleIcon, LinkedInIcon } from "@/components/icons/brand-icons";

const WALLETCONNECT_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID);

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  function handleOAuth(provider: "github" | "google" | "linkedin") {
    setOauthLoading(provider);
    signIn(provider, { callbackUrl: "/dashboard" });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Failed to create account.");
        return;
      }

      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        toast.success("Account created. Please sign in.");
        router.push("/login");
        return;
      }

      toast.success("Account created successfully.");
      router.push("/dashboard");
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
            <h1 className="text-xl font-semibold">Create an account</h1>
            <p className="text-sm text-muted-foreground">
              Get started tracking and sharing your credentials.
            </p>
          </div>

          {WALLETCONNECT_CONFIGURED ? (
            <WalletConnectButton />
          ) : (
            <Button
              type="button"
              size="lg"
              className="h-11 w-full gap-2 bg-indigo-600 text-white hover:bg-indigo-600/90 dark:bg-indigo-500 dark:hover:bg-indigo-500/90"
              onClick={() =>
                toast.info("WalletConnect is not configured. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local.")
              }
            >
              <Wallet className="size-4" />
              Continue with WalletConnect
            </Button>
          )}

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

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
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
            <Button type="submit" className="mt-1 h-10" disabled={isSubmitting}>
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

/**
 * Split out because `useAppKit` throws if `createAppKit` was never called —
 * this component only mounts when NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set.
 */
function WalletConnectButton() {
  const { open } = useAppKit();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      await open();
    } catch {
      toast.error("Failed to open WalletConnect modal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      size="lg"
      className="h-11 w-full gap-2 bg-indigo-600 text-white hover:bg-indigo-600/90 dark:bg-indigo-500 dark:hover:bg-indigo-500/90"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
      Continue with WalletConnect
    </Button>
  );
}
