"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wallet, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppKitWallet } from "@/hooks/use-appkit-wallet";
import { formatAddress } from "@/lib/utils";
import { LinkedWalletInfo } from "@/components/dashboard/linked-wallet-info";
import { DisconnectWalletDialog } from "@/components/wallet/disconnect-wallet-dialog";
// Importing this is what runs createAppKit(), which useAppKitWallet requires.
// It sits in the same module graph as the consumer and this whole file loads
// as one lazy chunk, so initialisation always precedes the hook — no race.
import "@/providers/appkit-provider";

/**
 * Wallet card for /dashboard/settings. Default-exported so the settings page
 * can pull it in with next/dynamic — it is that page's only route to
 * @reown/appkit, and importing it eagerly would put the whole AppKit + Lit
 * graph into the route's compilation unit. See docs/prds/dev-performance.md.
 */
export default function AppKitWalletSection({
  linkedWallet,
  onWalletConnected,
}: {
  linkedWallet: string | null;
  onWalletConnected: () => void;
}) {
  const { address, isConnected, openModal, disconnect } = useAppKitWallet();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  // The AppKit modal drives its own SIWE sign-in/link flow internally (see
  // lib/siwe-config.ts) — once it reports a connected address, that flow has
  // already resolved, so refresh the profile to pick up the newly linked wallet.
  useEffect(() => {
    if (isConnected && address) onWalletConnected();
  }, [isConnected, address, onWalletConnected]);

  async function handleConnect() {
    try {
      await openModal();
    } catch {
      toast.error("Failed to open wallet modal.");
    }
  }

  /**
   * No success toast: disconnecting ends the session, so siweConfig.signOut
   * navigates to "/" and this page unmounts before a toast could be read.
   */
  async function handleDisconnect() {
    try {
      await disconnect();
    } catch {
      toast.error("Failed to disconnect the wallet.");
      setConfirmingDisconnect(false);
    }
  }

  return (
    <>
      {isConnected && address ? (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted">
              <Wallet className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium font-mono">{formatAddress(address, 6)}</p>
              <p className="text-xs text-muted-foreground">Connected</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setConfirmingDisconnect(true)}
          >
            <Unplug className="size-3.5" />
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          {/* A linked wallet is not a live connection — registration and
              /onboarding link one through the injected provider, never through
              AppKit (see hooks/use-wallet-proof.ts). Saying "No wallet
              connected" to someone who has just linked one reads as the app
              having lost it, so name the actual state. */}
          <div>
            <p className="text-sm font-medium">
              {linkedWallet ? "Wallet not connected in this browser" : "No wallet connected"}
            </p>
            <p className="text-xs text-muted-foreground">
              {linkedWallet
                ? "Your linked wallet is shown below. Connect it here to sign on-chain transactions."
                : "Connect a wallet to interact with on-chain credentials."}
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleConnect}>
            <Wallet className="size-3.5" />
            Connect
          </Button>
        </div>
      )}

      <LinkedWalletInfo address={linkedWallet} />

      <DisconnectWalletDialog
        open={confirmingDisconnect}
        onOpenChange={setConfirmingDisconnect}
        onConfirm={handleDisconnect}
      />
    </>
  );
}
