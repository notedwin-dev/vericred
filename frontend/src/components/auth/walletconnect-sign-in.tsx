"use client";

import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { WalletButtonShell } from "@/components/auth/wallet-button-shell";

const WALLETCONNECT_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID);

/**
 * Lazy boundary in front of @reown/appkit.
 *
 * /login and /register/user used to import AppKitProvider statically, which put
 * the whole AppKit + Lit graph in their server compilation unit: /login cold-
 * compiled for 22.3s in dev (27.0s to first byte). Since the App Router cannot
 * commit the new URL until the destination's RSC payload starts streaming,
 * clicking "Get Started" on the landing page looked like nothing had happened
 * for that entire time — /login's own loading.tsx could not help, because it
 * ships *inside* the payload we were still waiting for.
 *
 * Going through next/dynamic took that to 13.3s compile / 15.8s TTFB, and cut
 * /login's production First Load JS from ~240kB to 143kB — public visitors no
 * longer download AppKit to type an email and password.
 *
 * The remaining ~8s over the ~5s floor is Turbopack building this chunk during
 * the route's dev compile anyway; measured by stubbing the import out, which
 * put /login at 5.0s. That part is the price of /login offering WalletConnect
 * at all, so don't expect a further win from rearranging the boundary — the
 * only lever left would be removing AppKit from the route.
 *
 * `ssr: false` because createAppKit() touches window; the placeholder below is
 * the same shell as the real button, so nothing moves when it swaps in.
 */
const WalletConnectSignInButton = dynamic(
  () => import("@/components/auth/walletconnect-sign-in-button"),
  {
    ssr: false,
    loading: () => (
      <WalletButtonShell disabled>
        <Wallet className="size-4" />
        Continue with WalletConnect
      </WalletButtonShell>
    ),
  }
);

/** WalletConnect sign-in, or an explanatory no-op when the project ID is unset. */
export function WalletConnectSignIn() {
  if (!WALLETCONNECT_CONFIGURED) {
    return (
      <WalletButtonShell
        onClick={() =>
          toast.info(
            "WalletConnect is not configured. Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID in .env.local."
          )
        }
      >
        <Wallet className="size-4" />
        Continue with WalletConnect
      </WalletButtonShell>
    );
  }

  return <WalletConnectSignInButton />;
}
