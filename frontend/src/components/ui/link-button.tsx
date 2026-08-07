"use client";

import Link, { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";
import type { VariantProps } from "class-variance-authority";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Swaps the button's label for a spinner while its navigation is in flight.
 *
 * Must be rendered *inside* the <Link>, since useLinkStatus reads context the
 * Link provides — which is why this is a child component and not a hook call up
 * in LinkButton. The label is hidden with `opacity-0` rather than unmounted so
 * the button keeps its width and nothing jumps; no transition on it, or the
 * label spends the fade overlapping the spinner that sits on top of it.
 */
function LinkButtonContent({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();

  return (
    <>
      <span
        className={cn("inline-flex items-center gap-[inherit]", pending && "opacity-0")}
      >
        {children}
      </span>
      {pending && (
        <Loader2
          aria-label="Loading"
          className="absolute size-4 animate-spin"
        />
      )}
    </>
  );
}

type LinkButtonProps = React.ComponentProps<typeof Link> &
  VariantProps<typeof buttonVariants>;

/**
 * A <Button> that navigates, with click feedback built in.
 *
 * The App Router does not commit the new URL until the destination's RSC
 * payload starts streaming, so on a slow route (or any route in dev, where
 * <Link> does not prefetch) a plain `<Button render={<Link/>}/>` sits there
 * looking unclicked — the destination's own loading.tsx cannot help, because it
 * ships *inside* the payload we are still waiting for. useLinkStatus covers
 * exactly that gap: it flips as soon as the click is handled.
 *
 * Prefer this over `<Button render={<Link/>} nativeButton={false}>` anywhere a
 * button navigates.
 */
export function LinkButton({
  className,
  variant,
  size,
  children,
  ...linkProps
}: LinkButtonProps) {
  return (
    <Button
      render={<Link {...linkProps} />}
      nativeButton={false}
      variant={variant}
      size={size}
      className={cn("relative", className)}
    >
      <LinkButtonContent>{children}</LinkButtonContent>
    </Button>
  );
}
