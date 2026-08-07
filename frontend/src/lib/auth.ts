import NextAuth, { CredentialsSignin } from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import LinkedIn from "next-auth/providers/linkedin";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { cookies } from "next/headers";
import { SiweMessage } from "siwe";
import { prisma } from "@/lib/prisma";
import { LINK_INTENT_COOKIE, LINK_INTENT_TTL_MS, verifyLinkIntent } from "@/lib/link-intent";
import {
  AuthorizationError,
  assertWalletIsNotInstitution,
  authorizeEmailPassword,
  authorizeInstitution,
} from "@/lib/auth-credentials";
import type { Role } from "@/types";

const NEXTAUTH_DOMAIN = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).host : undefined;

class CredentialsAuthError extends CredentialsSignin {
  code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

/**
 * Runs a framework-free authorizer from lib/auth-credentials.ts, translating
 * its AuthorizationError into the CredentialsSignin subclass Auth.js needs in
 * order to put a `code` in the sign-in redirect URL. Keeping the translation
 * here is what lets the authorization rules themselves be tested without
 * booting NextAuth.
 */
async function runAuthorizer<T>(authorizer: () => Promise<T>): Promise<T> {
  try {
    return await authorizer();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      throw new CredentialsAuthError(error.code);
    }
    throw error;
  }
}

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    LinkedIn({
      clientId: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    }),
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        return runAuthorizer(() => authorizeEmailPassword(credentials?.email, credentials?.password));
      },
    }),
    Credentials({
      id: "institution",
      name: "Institution",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        message: { label: "Message", type: "text" },
        signature: { label: "Signature", type: "text" },
      },
      async authorize(credentials) {
        return runAuthorizer(() => authorizeInstitution(credentials ?? {}));
      },
    }),
    Credentials({
      id: "wallet",
      name: "Ethereum",
      credentials: {
        message: { label: "Message", type: "text" },
        signature: { label: "Signature", type: "text" },
      },
      async authorize(credentials, request) {
        const message = credentials?.message;
        const signature = credentials?.signature;

        if (typeof message !== "string" || typeof signature !== "string" || !NEXTAUTH_DOMAIN) {
          return null;
        }

        let siwe: SiweMessage;
        try {
          siwe = new SiweMessage(message);
        } catch {
          return null;
        }

        // The client sets the SIWE nonce to getCsrfToken(), which is stored in
        // the next-auth / authjs csrf-token cookie. Verify it server-side so
        // replayed messages from other sessions are rejected. The CSRF token
        // rotates after a successful sign-in, giving one-time-use semantics.
        const cookieHeader = request.headers.get("cookie") ?? "";
        const expectedNonce = cookieHeader
          .split(";")
          .map((c) => c.trim())
          .reduce<string | undefined>((found, c) => {
            if (found) return found;
            const eq = c.indexOf("=");
            if (eq === -1) return undefined;
            if (c.slice(0, eq).endsWith("csrf-token"))
              return decodeURIComponent(c.slice(eq + 1)).split("|")[0];
            return undefined;
          }, undefined);

        if (!expectedNonce || siwe.nonce !== expectedNonce) {
          return null;
        }

        try {
          const result = await siwe.verify({ signature, domain: NEXTAUTH_DOMAIN, nonce: expectedNonce });
          if (!result.success) {
            return null;
          }
        } catch {
          return null;
        }

        const walletAddress = siwe.address.toLowerCase();

        // An institution's on-chain identity is not a personal login — see the
        // rule in lib/auth-credentials.ts for what went wrong without it.
        await runAuthorizer(() => assertWalletIsNotInstitution(walletAddress));

        let user = await prisma.user.findUnique({ where: { walletAddress } });
        if (!user) {
          user = await prisma.user.create({
            data: { walletAddress, role: "USER" },
          });
        }

        return {
          id: user.id,
          name: user.name,
          username: user.username,
          email: user.email,
          image: user.image,
          role: user.role,
          walletAddress: user.walletAddress,
        };
      },
    }),
  ],
  callbacks: {
    /**
     * Completes the "link an additional social account" flow started from
     * Settings (see /api/user/link-intent). By the time this callback
     * runs, the PrismaAdapter has already resolved `user` for this OAuth
     * identity — either an existing user (already-linked account) or a
     * brand-new one it just created (first time this identity was seen).
     * If a signed link-intent cookie says "attach this to user X" and the
     * adapter created a fresh orphan instead, re-parent the new Account
     * row onto X and delete the orphan. If the identity already belongs
     * to a *different*, pre-existing user, refuse — that's a genuine
     * conflict, not something to silently merge.
     */
    async signIn({ user, account }) {
      if (account?.type !== "oauth" || !user?.id) return true;

      const cookieStore = await cookies();
      const intentCookie = cookieStore.get(LINK_INTENT_COOKIE)?.value;
      if (!intentCookie) return true;
      cookieStore.delete(LINK_INTENT_COOKIE);

      const intent = verifyLinkIntent(intentCookie);
      if (!intent || intent.provider !== account.provider) return true;

      if (user.id === intent.userId) return true; // already the right account

      const resolvedUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, createdAt: true, accounts: { select: { provider: true } } },
      });
      const isFreshOrphan =
        resolvedUser !== null &&
        resolvedUser.accounts.length === 1 &&
        // Matches the link-intent cookie's own TTL — anything older than
        // that can't have been created by *this* link attempt.
        Date.now() - resolvedUser.createdAt.getTime() < LINK_INTENT_TTL_MS;

      if (!isFreshOrphan) {
        // This provider identity is already tied to a different, pre-existing
        // account — refuse rather than silently switching the session to it.
        return "/login?error=AccountAlreadyLinked";
      }

      let target;
      try {
        target = await prisma.$transaction(async (tx) => {
          await tx.account.update({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
            data: { userId: intent.userId },
          });
          await tx.user.delete({ where: { id: user.id! } });
          return tx.user.findUnique({ where: { id: intent.userId } });
        });
      } catch (error) {
        // Most likely intent.userId no longer exists (deleted between the
        // link attempt starting and the OAuth redirect completing), which
        // makes the account update above fail its foreign-key constraint.
        // Don't let that escape as an unhandled error — the orphan account
        // this callback almost re-parented is still intact either way.
        console.error("[auth] Failed to complete account link:", error);
        return "/login?error=AccountAlreadyLinked";
      }

      if (!target) return "/login?error=AccountAlreadyLinked";

      // Redirect the in-flight sign-in onto the real target user so the
      // jwt callback below mints a token for the right account.
      user.id = target.id;
      user.name = target.name;
      user.email = target.email;
      user.image = target.image;
      (user as { username?: string | null }).username = target.username;
      (user as { role?: Role }).role = target.role;
      (user as { walletAddress?: string | null }).walletAddress = target.walletAddress;

      return true;
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id as string;
        token.username = (user as { username?: string | null }).username ?? null;
        token.role = (user as { role?: Role }).role ?? "USER";
        token.walletAddress = (user as { walletAddress?: string | null }).walletAddress ?? null;
      }

      // On subsequent requests, keep the token's role/wallet in sync with
      // the database in case they changed elsewhere (e.g. wallet linking,
      // admin promoting a user to ISSUER). Rate-limit DB queries to once per
      // 60 seconds to reduce load — except on an explicit client-side
      // `update()` call (e.g. after saving the profile form), which always
      // resyncs immediately so the change is reflected without a re-login.
      if (!user && token.id) {
        const now = Math.floor(Date.now() / 1000);
        const lastRefresh = (token.lastRefresh as number) ?? 0;
        const REFRESH_TTL = 60; // seconds

        if (trigger === "update" || now - lastRefresh >= REFRESH_TTL) {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: {
              role: true,
              username: true,
              walletAddress: true,
              image: true,
              email: true,
              pendingEmail: true,
            },
          });
          if (dbUser) {
            token.role = dbUser.role;
            token.username = dbUser.username;
            token.walletAddress = dbUser.walletAddress;
            token.picture = dbUser.image;
            token.email = dbUser.email ?? undefined;
            token.pendingEmail = dbUser.pendingEmail;
            token.lastRefresh = now;
          } else {
            // The user this token was issued for no longer exists (deleted
            // account, admin action, etc.) — end the session instead of
            // continuing to trust a token with stale role/identity fields
            // for up to the rest of its natural lifetime.
            return null;
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.username = (token.username as string | null) ?? null;
        session.user.role = (token.role as Role) ?? "USER";
        session.user.walletAddress = (token.walletAddress as string | null) ?? null;
        session.user.pendingEmail = (token.pendingEmail as string | null) ?? null;
        if (token.picture) session.user.image = token.picture as string;
        if (token.email) session.user.email = token.email as string;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
