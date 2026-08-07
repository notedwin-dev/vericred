"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { useState } from "react";
import {
  ShieldCheck,
  LayoutDashboard,
  Building2,
  Menu,
  Search,
  Moon,
  Sun,
  Settings,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { activeNavHref, buildNavItems, roleBadge, roleHome } from "@/lib/navigation";
import { useRole } from "@/hooks/use-role";
import {
  ProfileDropdownMenu,
  type DropdownProps,
} from "@/components/layout/profile-dropdown-menu";

/**
 * Loaded lazily on purpose. This is the navbar's only link to @reown/appkit,
 * and pulling it in eagerly placed the whole AppKit + Lit graph in every
 * authenticated route's compilation unit (~20s of dev compile on /dashboard
 * and /issuer). ssr:false because AppKit is browser-only anyway; the fallback
 * is the same avatar button so the header does not shift when it swaps in.
 */
const AppKitProfileDropdown = dynamic(
  () => import("@/components/layout/appkit-profile-dropdown"),
  {
    ssr: false,
    loading: () => <Skeleton className="size-8 rounded-full" />,
  }
);

const WALLETCONNECT_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID);

/** Which destinations exist per role lives in lib/navigation.ts; this is only
 *  the icon for each, kept here so the model stays free of UI imports. */
const NAV_ICONS = {
  dashboard: LayoutDashboard,
  issuer: Building2,
  settings: Settings,
} as const;

export function Navbar() {
  const pathname = usePathname();
  const { role, user } = useRole();
  const { theme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = buildNavItems(role ?? "USER");
  const activeHref = activeNavHref(pathname, navItems);
  const badge = role ? roleBadge(role) : null;
  const home = roleHome(role ?? "USER");
  const initials = (user?.name || user?.email || "?").slice(0, 2).toUpperCase();
  const username = (user as { username?: string | null } | null)?.username;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          {/* The badge states which context you are in, so the navigation
              below does not need a tab whose only job is to say "you are an
              issuer" while pointing where Dashboard already goes. */}
          <Link href={home} className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5" />
            <span className="hidden sm:inline">VeriCred</span>
            {badge && (
              <Badge variant="secondary" className="font-normal">
                {badge}
              </Badge>
            )}
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const Icon = NAV_ICONS[item.id];
              return (
                <LinkButton
                  key={item.href}
                  href={item.href}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "gap-1.5 text-muted-foreground",
                    activeHref === item.href && "bg-muted text-foreground"
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </LinkButton>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <LinkButton
            href="/verify"
            size="sm"
            className="hidden gap-1.5 border border-input bg-white text-black shadow-sm hover:bg-white/90 sm:inline-flex dark:bg-white dark:text-black dark:hover:bg-white/90"
          >
            <Search className="size-4" />
            Verify
          </LinkButton>

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

          {WALLETCONNECT_CONFIGURED ? (
            <AppKitProfileDropdown user={user} initials={initials} username={username} />
          ) : (
            <FallbackProfileDropdown user={user} initials={initials} username={username} />
          )}

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
                  {badge && (
                    <Badge variant="secondary" className="font-normal">
                      {badge}
                    </Badge>
                  )}
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
                {navItems.map((item) => {
                  const Icon = NAV_ICONS[item.id];
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium hover:bg-muted",
                        activeHref === item.href && "bg-muted"
                      )}
                    >
                      <Icon className="size-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

// ── Dropdown internals ──────────────────────────────────────────────

function FallbackProfileDropdown({ user, initials, username }: DropdownProps) {
  return (
    <ProfileDropdownMenu
      user={user}
      initials={initials}
      username={username}
      subtitle={user?.email ?? null}
      isConnected={false}
      onDisconnect={undefined}
    />
  );
}
