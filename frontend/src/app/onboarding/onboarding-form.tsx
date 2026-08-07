"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Check, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useWalletProof } from "@/hooks/use-wallet-proof";
import { ONBOARDING_WALLET_MESSAGE } from "@/lib/wallet-messages";
import { isValidUsername } from "@/lib/validation";

export function OnboardingForm({
  initialUsername,
  hasWallet,
}: {
  initialUsername: string;
  hasWallet: boolean;
}) {
  const router = useRouter();
  const { update } = useSession();
  const [username, setUsername] = useState(initialUsername);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { proof, address, hasProvider, isBusy, error: walletError, requestProof } =
    useWalletProof(ONBOARDING_WALLET_MESSAGE);

  useEffect(() => {
    if (walletError) toast.error(walletError);
  }, [walletError]);

  const usernameLooksValid = isValidUsername(username.trim().toLowerCase());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!usernameLooksValid) {
      toast.error("Pick a username of 3-32 letters, numbers, hyphens or underscores.");
      return;
    }

    const signed = proof ?? (await requestProof());
    if (!signed) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/user/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          walletAddress: signed.address,
          message: signed.message,
          signature: signed.signature,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Could not finish setting up your account.");
        return;
      }

      // Refresh the JWT immediately so the (authenticated) layout's gate sees
      // the new username/wallet instead of bouncing straight back here.
      await update();
      toast.success("You're all set.");
      router.push("/dashboard");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="flex flex-col gap-5 pt-2">
        <div>
          <h1 className="text-xl font-semibold">Finish setting up</h1>
          <p className="text-sm text-muted-foreground">
            Pick a username for your public profile and link the wallet your credentials will be issued to.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
              3-32 characters: lowercase letters, numbers, hyphens, underscores. Your profile will live at
              /u/{username.trim().toLowerCase() || "username"}.
            </p>
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
            {hasWallet ? (
              <p className="text-xs text-muted-foreground">
                Signing again re-confirms the wallet already on your account.
              </p>
            ) : !hasProvider ? (
              <p className="text-xs text-muted-foreground">
                No browser wallet detected. Install MetaMask to continue — credentials are issued to a wallet
                address.
              </p>
            ) : null}
          </div>

          <Button type="submit" className="mt-1 h-10" disabled={isSubmitting || isBusy}>
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : "Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
