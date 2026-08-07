"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { LayoutDashboard, LogOut, Unplug, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * The avatar menu itself, deliberately free of any wallet dependency.
 *
 * It is split out of navbar.tsx so that the AppKit-aware wrapper
 * (appkit-profile-dropdown.tsx) can live in a lazily-loaded chunk without
 * dragging this — or the navbar — along with it.
 */

export interface DropdownProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    /** The wallet recorded on the account, which is not the same as a live connection. */
    walletAddress?: string | null;
  } | null;
  initials: string;
  username: string | null | undefined;
}

export function ProfileDropdownMenu({
  user,
  initials,
  username,
  subtitle,
  isConnected,
  onDisconnect,
  onSignOut,
}: DropdownProps & {
  subtitle: string | null;
  isConnected: boolean;
  onDisconnect: (() => void) | undefined;
  /**
   * Overrides the plain sign-out. The AppKit-aware wrapper passes one that
   * tears down the wallet connection first — without it the WalletConnect /
   * injected session outlives the NextAuth one, and the next visit to /login
   * re-runs SIWE against the still-connected wallet, prompting for a signature
   * before the user has asked to sign in with anything.
   */
  onSignOut?: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" className="rounded-full" />
        }
      >
        <Avatar size="sm">
          <AvatarImage src={user?.image ?? undefined} alt={user?.name ?? "User"} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span className="font-medium">{user?.name || "Account"}</span>
              {subtitle && (
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {subtitle}
                </span>
              )}
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/dashboard" />}>
          <LayoutDashboard />
          Dashboard
        </DropdownMenuItem>
        {username && (
          <DropdownMenuItem render={<Link href={`/u/${username}`} />}>
            <User />
            Public Profile
          </DropdownMenuItem>
        )}
        {isConnected && onDisconnect && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDisconnect}>
              <Unplug />
              Disconnect Wallet
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => (onSignOut ? onSignOut() : signOut({ redirectTo: "/" }))}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
