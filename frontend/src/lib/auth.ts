import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import LinkedIn from "next-auth/providers/linkedin";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcrypt";
import { SiweMessage } from "siwe";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/types";

const NEXTAUTH_DOMAIN = process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).host : undefined;

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
        const email = credentials?.email;
        const password = credentials?.password;

        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });

        if (!user || !user.passwordHash) {
          return null;
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          walletAddress: user.walletAddress,
        };
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

        let user = await prisma.user.findUnique({ where: { walletAddress } });
        if (!user) {
          user = await prisma.user.create({
            data: { walletAddress, role: "USER" },
          });
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          walletAddress: user.walletAddress,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role?: Role }).role ?? "USER";
        token.walletAddress = (user as { walletAddress?: string | null }).walletAddress ?? null;
      }

      // Allow client-side `update()` calls (e.g. after linking a wallet) to
      // refresh the token without requiring a full re-login. Role and
      // walletAddress are sourced exclusively from the database resync below.
      if (trigger === "update" && session) {
        // Trigger database resync on update
      }

      // On subsequent requests, keep the token's role/wallet in sync with
      // the database in case they changed elsewhere (e.g. wallet linking,
      // admin promoting a user to ISSUER). Rate-limit DB queries to once per
      // 60 seconds to reduce load.
      if (!user && token.id) {
        const now = Math.floor(Date.now() / 1000);
        const lastRefresh = (token.lastRefresh as number) ?? 0;
        const REFRESH_TTL = 60; // seconds

        if (now - lastRefresh >= REFRESH_TTL) {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true, walletAddress: true },
          });
          if (dbUser) {
            token.role = dbUser.role;
            token.walletAddress = dbUser.walletAddress;
            token.lastRefresh = now;
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as Role) ?? "USER";
        session.user.walletAddress = (token.walletAddress as string | null) ?? null;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
