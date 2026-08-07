"use client";

import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatAddress } from "@/lib/utils";

/**
 * Shows the wallet recorded against the account on-chain. Shared by both the
 * AppKit and the not-configured variants of the settings wallet card, so it
 * lives outside the lazily-loaded AppKit chunk.
 */
export function LinkedWalletInfo({ address }: { address: string | null }) {
  if (!address) return null;

  return (
    <>
      <Separator />
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Linked wallet (on-chain identity)</p>
          <p className="text-sm font-mono">{formatAddress(address, 8)}</p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Copy address"
          onClick={() => {
            navigator.clipboard.writeText(address);
            toast.success("Address copied.");
          }}
        >
          <Copy className="size-3.5" />
        </Button>
      </div>
    </>
  );
}
