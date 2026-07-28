import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import LinkedIn from "next-auth/providers/linkedin";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/types";

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
