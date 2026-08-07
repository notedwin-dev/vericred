"use client";

import { getCsrfToken, getSession, signIn, signOut } from "next-auth/react";
import { SiweMessage } from "siwe";
import { getAddress } from "ethers";
import {
  createSIWEConfig,
  type SIWECreateMessageArgs,
  type SIWESession,
  type SIWEVerifyMessageArgs,
} from "@reown/appkit-siwe";
import { CHAIN_ID } from "@/lib/config";

const STATEMENT = "Sign in to VeriCred with your wallet.";

export const siweConfig = createSIWEConfig({
  /**
   * AppKit defaults all three of these to `true`. Only the first is wanted.
   *
   * The trap is `getSession` below: it reports `User.walletAddress` as "the
   * SIWE session address". That column is the account's *on-chain identity*,
   * not proof that this browser authenticated by signing — an email/password
   * user who linked a wallet at /onboarding has one too. AppKit then treats any
   * divergence between it and the live connection as a reason to end the
   * session:
   *
   *   - `signOutOnAccountChange` — connect any wallet whose address differs
   *     from the linked one and AppKit calls signOut. So a user signed in with
   *     email/password, clicking the navbar pill to connect their wallet, got
   *     signed out and bounced to the landing page.
   *   - `signOutOnNetworkChange` — `getSession` hardcodes `chainId: CHAIN_ID`,
   *     so connecting while the wallet sits on any other network counted as a
   *     mismatch and did the same thing.
   *
   * Neither is a real authentication failure; the session cookie is valid
   * throughout. Being on the wrong network is not grounds for logging someone
   * out, and connecting a wallet is something `verifyMessage` below already
   * handles properly (it links, rather than re-authenticating, when a session
   * exists). Disconnecting *is* an explicit act, so that one stays on.
   *
   * Consequence to know about: these flags also drive AppKit's mismatch
   * detection in `getSessions`, so with them off, connecting a *different*
   * wallet than the linked one no longer re-prompts for a signature — it just
   * connects, and `User.walletAddress` is left alone. Changing the wallet an
   * account is identified by is a deliberate Settings action, not something to
   * infer from someone switching accounts in MetaMask.
   */
  signOutOnDisconnect: true,
  signOutOnAccountChange: false,
  signOutOnNetworkChange: false,

  getMessageParams: async () => ({
    domain: typeof window !== "undefined" ? window.location.host : "",
    uri: typeof window !== "undefined" ? window.location.origin : "",
    chains: [CHAIN_ID],
    statement: STATEMENT,
  }),
  createMessage: ({ nonce, address, chainId }: SIWECreateMessageArgs) =>
    new SiweMessage({
      version: "1",
      domain: window.location.host,
      uri: window.location.origin,
      address: getAddress(address.split(":").pop()!),
      chainId,
      nonce,
      statement: STATEMENT,
      issuedAt: new Date().toISOString(),
    }).prepareMessage(),
  getNonce: async () => {
    const nonce = await getCsrfToken();
    if (!nonce) {
      throw new Error("Failed to get nonce");
    }
    return nonce;
  },
  getSession: async () => {
    const session = await getSession();
    if (!session?.user?.walletAddress) {
      return null;
    }
    return {
      address: session.user.walletAddress,
      chainId: CHAIN_ID,
    } satisfies SIWESession;
  },
  verifyMessage: async ({ message, signature }: SIWEVerifyMessageArgs) => {
    try {
      // If the browser already has an authenticated session, treat this
      // wallet connection as linking it to the current account (mirrors
      // the OAuth "link an additional provider" flow) rather than as a
      // sign-in — otherwise NextAuth's credentials flow below would
      // establish a brand-new session for whatever user the wallet
      // resolves to, silently swapping out the logged-in identity.
      const session = await getSession();
      if (session?.user?.id) {
        const siwe = new SiweMessage(message);
        const res = await fetch("/api/wallet/link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: siwe.address, message, signature }),
        });
        return res.ok;
      }

      const result = await signIn("wallet", {
        message,
        signature,
        redirect: false,
      });
      return Boolean(result?.ok);
    } catch {
      return false;
    }
  },
  /**
   * AppKit calls this whenever the wallet disconnects or switches accounts
   * (`signOutOnDisconnect` / `signOutOnAccountChange`, both default true), so
   * this is the single point every disconnect path funnels through — our own
   * buttons and AppKit's account modal alike.
   *
   * It must redirect rather than use `{ redirect: false }`. The route gate in
   * `app/(authenticated)/layout.tsx` is an async *server* component: clearing
   * the cookie client-side does not re-run it, so the user was left sitting on
   * a fully rendered /dashboard with the session already gone — signed out in
   * fact, signed in on screen, until a hard refresh. Navigating is what makes
   * the server re-evaluate the gate.
   */
  signOut: async () => {
    try {
      await signOut({ redirectTo: "/" });
      return true;
    } catch {
      return false;
    }
  },
});
