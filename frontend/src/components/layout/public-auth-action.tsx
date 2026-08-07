"use client";

import { useSession } from "next-auth/react";
import { LinkButton } from "@/components/ui/link-button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Sign-in CTA used on public pages (landing, verify) that sit outside the
 * (authenticated) layout and therefore don't get the shared Navbar. Reads
 * the session directly so it reflects the real auth state instead of a
 * hardcoded "Sign In" link.
 */
export function PublicAuthAction() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <Skeleton className="h-9 w-24 rounded-md" />;
  }

  if (status === "authenticated" && session.user) {
    const initials = (session.user.name || session.user.email || "?").slice(0, 2).toUpperCase();
    return (
      <LinkButton href="/dashboard" variant="outline" className="gap-2 pl-2">
        <Avatar size="sm">
          <AvatarImage src={session.user.image ?? undefined} alt={session.user.name ?? "User"} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        Dashboard
      </LinkButton>
    );
  }

  return (
    <LinkButton href="/login" variant="outline">
      Sign In
    </LinkButton>
  );
}
