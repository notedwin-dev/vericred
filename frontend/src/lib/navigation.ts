import type { Role } from "@/types";

export interface NavItem {
  id: "dashboard" | "issuer" | "settings";
  href: string;
  label: string;
}

/**
 * Where a role's "home" actually is.
 *
 * `/dashboard` is a recipient-focused credentials view, so
 * `app/(authenticated)/dashboard/page.tsx` redirects ISSUER and ADMIN
 * straight back out of it. Linking them at `/dashboard` therefore produced a
 * pointless round-trip, and made the role's own tab a duplicate of the
 * Dashboard tab — two entries, one destination.
 */
export function roleHome(role: Role): string {
  if (role === "ADMIN") return "/admin";
  if (role === "ISSUER") return "/issuer";
  return "/dashboard";
}

/** The badge shown beside the wordmark, or null for an ordinary account. */
export function roleBadge(role: Role): string | null {
  if (role === "ADMIN") return "Admin";
  if (role === "ISSUER") return "Issuer";
  return null;
}

/**
 * Primary navigation for a role.
 *
 * The role's own area is *not* a tab — which context you are in is stated by
 * the badge next to the wordmark instead. A tab labelled "Issuer" told an
 * issuer something they already knew and pointed where "Dashboard" already
 * went.
 *
 * ADMIN keeps an Issuer entry because for them `/issuer` is a genuinely
 * different area from their own home at `/admin`, not a restatement of it.
 */
export function buildNavItems(role: Role): NavItem[] {
  const items: NavItem[] = [{ id: "dashboard", href: roleHome(role), label: "Dashboard" }];

  if (role === "ADMIN") {
    items.push({ id: "issuer", href: "/issuer", label: "Issuer" });
  }

  items.push({ id: "settings", href: "/dashboard/settings", label: "Settings" });
  return items;
}

/**
 * Which item the current path belongs to, by longest matching prefix.
 *
 * Prefix length matters: `/dashboard/settings` also starts with `/dashboard`,
 * so a first-match scan lit up both Dashboard and Settings at once for an
 * ordinary user.
 */
export function activeNavHref(pathname: string | null, items: NavItem[]): string | null {
  if (!pathname) return null;

  return (
    [...items]
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.href ?? null
  );
}
