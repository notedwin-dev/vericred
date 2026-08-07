"use client";

import { useState } from "react";
import { Wallet, Loader2 } from "lucide-react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn, formatAddress } from "@/lib/utils";
import { useAppKitWallet } from "@/hooks/use-appkit-wallet";
import { DisconnectWalletDialog } from "@/components/wallet/disconnect-wallet-dialog";
import {
  ProfileDropdownMenu,
  type DropdownProps,
} from "@/components/layout/profile-dropdown-menu";
// Importing this is what runs createAppKit(), which useAppKitWallet requires.
// Because it sits in the same module graph as the consumer below, and this
// whole file is loaded as one lazy chunk, initialisation is guaranteed to
// have happened before the hook runs — no race.
import "@/providers/appkit-provider";

/**
 * The wallet-aware avatar menu. Default-exported so navbar.tsx can pull it in
 * with next/dynamic.
 *
 * This file is the *only* thing in the authenticated layout that reaches
 * @reown/appkit. Loading it eagerly put the entire AppKit + Lit graph into the
 * compilation unit of every authenticated route, costing ~20s of dev compile
 * on /dashboard and /issuer alone. Keep the import of it lazy.
 */
export default function AppKitProfileDropdown({
  user,
  initials,
  username,
}: DropdownProps) {
  const { address, isConnected, openModal, disconnect } = useAppKitWallet();
  const [isOpening, setIsOpening] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  /**
   * Two different things, deliberately not conflated:
   *
   *  - `liveAddress` — a wallet connected *right now*, via AppKit.
   *  - `linkedAddress` — the wallet recorded on the account (`User.walletAddress`),
   *    which is the on-chain identity credentials are issued to.
   *
   * They diverge routinely. Registration and /onboarding link a wallet through
   * `useWalletProof` (the injected provider) rather than AppKit — see that
   * hook for why — so an account can finish onboarding with a perfectly good
   * linked wallet while AppKit has never connected to anything. Showing only
   * AppKit's view meant the pill read "Connect Wallet" immediately after the
   * user had linked one, as though the app had forgotten.
   */
  const liveAddress = isConnected && address ? address : null;
  const linkedAddress = user?.walletAddress ?? null;
  const shownAddress = liveAddress ?? linkedAddress;

  /**
   * Connecting a wallet other than the linked one is allowed and no longer ends
   * the session (see lib/siwe-config.ts), so it has to be *said* — otherwise the
   * navbar shows one address while credentials are issued to another.
   */
  const isForeignWallet = Boolean(
    liveAddress && linkedAddress && liveAddress.toLowerCase() !== linkedAddress.toLowerCase()
  );

  const subtitle = liveAddress
    ? isForeignWallet
      ? `${formatAddress(liveAddress)} · not your linked wallet`
      : formatAddress(liveAddress)
    : linkedAddress
      ? `${formatAddress(linkedAddress)} · not connected`
      : user?.email ?? null;

  /**
   * No success toast: disconnecting ends the session, so siweConfig.signOut
   * navigates to "/" and this component unmounts before a toast could be read.
   */
  async function handleDisconnect() {
    try {
      await disconnect();
    } catch {
      toast.error("Failed to disconnect the wallet.");
      setConfirmingDisconnect(false);
    }
  }

  /**
   * Signing out has to drop the wallet connection too. AppKit persists it
   * independently of the NextAuth cookie, so a plain signOut left the wallet
   * connected — and because AppKit is wired with `siweConfig`, the next visit
   * to /login saw a live connection with no session and immediately asked the
   * user to sign a SIWE message they had not requested.
   *
   * Disconnecting usually triggers the sign-out on its own (siweConfig.signOut
   * via `signOutOnDisconnect`); the explicit signOut afterwards covers the case
   * where it does not fire, e.g. an account with no `walletAddress` for
   * siweConfig.getSession to match on.
   */
  async function handleSignOut() {
    try {
      if (isConnected) await disconnect();
    } catch {
      // A wallet that refuses to disconnect must not trap the user in the app.
    }
    await signOut({ redirectTo: "/" });
  }

  /**
   * Mirrors AppKit's own <appkit-button>: one control that reads "Connect
   * Wallet" when disconnected and shows the truncated address when connected,
   * opening the modal either way. `open()` picks the Connect or Account view
   * from the current connection state on its own, so it takes no argument.
   */
  async function handleOpen() {
    setIsOpening(true);
    try {
      await openModal();
    } catch {
      toast.error("Failed to open the wallet modal.");
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleOpen}
        disabled={isOpening}
        className="hidden rounded-full text-xs sm:inline-flex"
        title={
          isForeignWallet
            ? `Connected to ${formatAddress(liveAddress!)}, but your credentials are issued to ${formatAddress(linkedAddress!)}. Change your linked wallet in Settings.`
            : !liveAddress && linkedAddress
              ? "This wallet is linked to your account but not connected in this browser. Click to connect it."
              : undefined
        }
        aria-label={
          isForeignWallet
            ? `Connected wallet ${formatAddress(liveAddress!)} is not your linked wallet — open wallet menu`
            : liveAddress
              ? `Wallet ${formatAddress(liveAddress)} — open wallet menu`
              : linkedAddress
                ? `Wallet ${formatAddress(linkedAddress)} linked but not connected — connect it`
                : "Connect a wallet"
        }
      >
        {isOpening ? <Loader2 className="animate-spin" /> : <Wallet />}
        {shownAddress ? (
          // Muted when it is only the linked address, so "we know your wallet"
          // and "your wallet is connected" stay visually distinct.
          <span className={cn("font-mono", !liveAddress && "text-muted-foreground")}>
            {formatAddress(shownAddress)}
          </span>
        ) : (
          "Connect Wallet"
        )}
      </Button>

      <ProfileDropdownMenu
        user={user}
        initials={initials}
        username={username}
        subtitle={subtitle}
        isConnected={isConnected}
        onDisconnect={() => setConfirmingDisconnect(true)}
        onSignOut={handleSignOut}
      />

      <DisconnectWalletDialog
        open={confirmingDisconnect}
        onOpenChange={setConfirmingDisconnect}
        onConfirm={handleDisconnect}
      />
    </>
  );
}
