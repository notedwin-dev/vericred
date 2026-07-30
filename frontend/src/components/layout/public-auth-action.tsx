"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
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
      <Button
        render={<Link href="/dashboard" />}
        nativeButton={false}
        variant="outline"
        className="gap-2 pl-2"
      >
        <Avatar size="sm">
          <AvatarImage src={session.user.image ?? undefined} alt={session.user.name ?? "User"} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        Dashboard
      </Button>
    );
  }

  return (
    <Button render={<Link href="/login" />} nativeButton={false} variant="outline">
      Sign In
    </Button>
  );
}
