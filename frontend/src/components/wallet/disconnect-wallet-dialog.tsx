"use client";

import { useState } from "react";
import { Loader2, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirmation for disconnecting a wallet, which also ends the VeriCred session.
 *
 * Disconnecting signs you out whatever you originally signed in with, so this
 * has to be an explicit choice rather than a side effect of clicking a button
 * labelled "Disconnect" — a password user who linked a wallet has no reason to
 * expect it, and losing the session is not something a toast can undo.
 *
 * Deliberately free of any @reown/appkit import so it can be reused from both
 * disconnect sites without dragging AppKit into a new compilation unit; the
 * caller passes the actual disconnect as `onConfirm`.
 *
 * Note this can only guard *our* disconnect buttons. AppKit's account modal has
 * its own Disconnect, which goes straight to the same sign-out (see
 * lib/siwe-config.ts) without passing through here.
 */
export function DisconnectWalletDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  async function handleConfirm() {
    setIsDisconnecting(true);
    try {
      await onConfirm();
    } finally {
      // A successful disconnect navigates away, so this mostly matters when
      // it fails and the dialog is still on screen.
      setIsDisconnecting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disconnect wallet?</DialogTitle>
          <DialogDescription>
            This also signs you out of VeriCred. Your wallet stays linked to your
            account — you can sign back in and reconnect it at any time.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={isDisconnecting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="gap-1.5"
            disabled={isDisconnecting}
            onClick={handleConfirm}
          >
            {isDisconnecting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Unplug className="size-4" />
            )}
            Disconnect &amp; sign out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
