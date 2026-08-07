"use client";

import { useState } from "react";
import { useAppKit } from "@reown/appkit/react";
import { toast } from "sonner";
import { Loader2, Wallet } from "lucide-react";
import { WalletButtonShell } from "@/components/auth/wallet-button-shell";
// Importing this is what runs createAppKit(), which useAppKit below requires.
// Because it sits in the same module graph as its only consumer, and this whole
// file is loaded as one lazy chunk, initialisation is guaranteed to have
// happened before the hook runs — no race. Same arrangement as
// components/layout/appkit-profile-dropdown.tsx.
import "@/providers/appkit-provider";

/**
 * The real WalletConnect button. Default-exported so `walletconnect-sign-in.tsx`
 * can pull it in with next/dynamic — this file is the *only* thing on /login and
 * /register/user that reaches @reown/appkit, and keeping the import of it lazy
 * is what stops those routes compiling the entire AppKit + Lit graph before they
 * can render. Never import this directly from a page.
 */
export default function WalletConnectSignInButton() {
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
    <WalletButtonShell onClick={handleClick} disabled={loading}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
      Continue with WalletConnect
    </WalletButtonShell>
  );
}
