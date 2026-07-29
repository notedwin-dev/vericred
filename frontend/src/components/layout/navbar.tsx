"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import {
  ShieldCheck,
  LayoutDashboard,
  Building2,
  Shield,
  Menu,
  LogOut,
  Wallet,
  Search,
  Moon,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn, formatAddress } from "@/lib/utils";
import { useRole } from "@/hooks/use-role";
import { useWallet } from "@/hooks/use-wallet";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["USER", "ISSUER", "ADMIN"] },
  { href: "/issuer", label: "Issuer", icon: Building2, roles: ["ISSUER", "ADMIN"] },
  { href: "/admin", label: "Admin", icon: Shield, roles: ["ADMIN"] },
];

export function Navbar() {
  const pathname = usePathname();
  const { role, user } = useRole();
  const { address, isConnected } = useWallet();
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleLinks = links.filter((link) => role && link.roles.includes(role));

  const initials = (user?.name || user?.email || "?").slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5" />
            <span className="hidden sm:inline">VeriCred</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {visibleLinks.map((link) => {
              const active = pathname === link.href || pathname?.startsWith(link.href + "/");
              return (
                <Button
                  key={link.href}
                  render={<Link href={link.href} />}
                  nativeButton={false}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "gap-1.5 text-muted-foreground",
                    active && "bg-muted text-foreground"
                  )}
                >
                  <link.icon className="size-4" />
                  {link.label}
                </Button>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <Button
            render={<Link href="/verify" />}
            nativeButton={false}
            variant="ghost"
            size="icon-sm"
            className="hidden sm:inline-flex"
            aria-label="Verify a credential"
          >
            <Search className="size-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden sm:inline-flex"
            aria-label="Toggle theme"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Sun className="size-4 scale-100 rotate-0 dark:scale-0 dark:-rotate-90" />
            <Moon className="absolute size-4 scale-0 rotate-90 dark:scale-100 dark:rotate-0" />
          </Button>

          {isConnected && (
            <span className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
              <Wallet className="size-3" />
              {formatAddress(address)}
            </span>
          )}

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
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="font-medium">{user?.name || "Account"}</span>
                  <span className="truncate text-xs font-normal text-muted-foreground">
                    {user?.email}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/dashboard" />}>
                <LayoutDashboard />
                Dashboard
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => signOut({ callbackUrl: "/" })}>
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={<Button variant="ghost" size="icon-sm" className="md:hidden" />}
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent side="left" className="w-64">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <ShieldCheck className="size-5" />
                  VeriCred
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4">
                <Link
                  href="/verify"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium hover:bg-muted"
                >
                  <Search className="size-4" />
                  Verify
                </Link>
                {visibleLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium hover:bg-muted"
                  >
                    <link.icon className="size-4" />
                    {link.label}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
