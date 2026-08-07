"use client";

import { Button } from "@/components/ui/button";

/**
 * The shared look of the "Continue with WalletConnect" button.
 *
 * Deliberately free of any @reown/appkit import: the loading placeholder and
 * the not-configured fallback both render it, and either pulling AppKit into
 * them would defeat the lazy split in `walletconnect-sign-in.tsx`. Sharing one
 * shell also keeps all three states exactly the same size, so swapping the
 * placeholder for the real button causes no layout shift.
 */
export function WalletButtonShell({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      size="lg"
      className="h-11 w-full gap-2 bg-indigo-600 text-white hover:bg-indigo-600/90 dark:bg-indigo-500 dark:hover:bg-indigo-500/90"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}
