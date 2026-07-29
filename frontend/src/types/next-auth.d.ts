import type { DefaultSession } from "next-auth";
import type { Role } from "@/types/index";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string | null;
      role: Role;
      walletAddress: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    username?: string | null;
    role?: Role;
    walletAddress?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    username?: string | null;
    role?: Role;
    walletAddress?: string | null;
  }
}
