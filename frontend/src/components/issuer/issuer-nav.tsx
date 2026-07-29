"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/issuer", label: "Overview" },
  { href: "/issuer/courses", label: "Courses" },
  { href: "/issuer/templates", label: "Templates" },
];

export function IssuerNav() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 border-b pb-px">
      {tabs.map((tab) => {
        const active =
          tab.href === "/issuer" ? pathname === "/issuer" : pathname?.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground",
              active && "border-foreground text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
