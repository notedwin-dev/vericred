"use client";

import { useSession } from "next-auth/react";
import type { Role } from "@/types";

/**
 * Convenience wrapper around next-auth's `useSession` for role-gated UI.
 * Returns loading/authenticated flags plus booleans for each app role.
 */
export function useRole() {
  const { data: session, status } = useSession();

  const role: Role | null = session?.user?.role ?? null;

  return {
    role,
    isLoading: status === "loading",
    isAuthenticated: status === "authenticated",
    isAdmin: role === "ADMIN",
    isIssuer: role === "ISSUER" || role === "ADMIN",
    isUser: role === "USER",
    user: session?.user ?? null,
  };
}
