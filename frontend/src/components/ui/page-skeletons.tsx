import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Shared building blocks for route-level `loading.tsx` files.
 *
 * These exist for navigation responsiveness, not just decoration. A route
 * without a `loading.tsx` has no Suspense boundary, and the App Router commits
 * the new URL and the new content in a single atomic state update — so the
 * address bar cannot change until the RSC payload has resolved. Adding a
 * loading file gives React a boundary it can commit against immediately,
 * which is what makes the URL update on click instead of after the wait.
 *
 * Keep these shapes roughly aligned with the real page: a skeleton that
 * reflows badly into the loaded layout reads as a glitch rather than as
 * progress.
 */

/** Page title + subtitle, matching the `h1` block most pages open with. */
export function HeaderSkeleton({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {withAction ? <Skeleton className="h-10 w-32 rounded-md" /> : null}
    </div>
  );
}

/** The `grid-cols-2 lg:grid-cols-4` stat row used by /issuer and /admin. */
export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="flex items-center gap-3">
            <Skeleton className="size-9 shrink-0 rounded-md" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-6 w-12" />
              <Skeleton className="h-3 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** A vertical list of credential/course rows. */
export function CardListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="flex items-center gap-4">
            <Skeleton className="size-10 shrink-0 rounded-md" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-1/3 min-w-32" />
              <Skeleton className="h-3 w-1/2 min-w-40" />
            </div>
            <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Centred card used by the auth pages (/login, /register/*, /onboarding).
 *
 * Those pages fetch nothing server-side, so this is not covering a data wait —
 * it exists so the router has a Suspense boundary to commit against, which is
 * what lets the URL change the moment the link is clicked instead of after the
 * route's RSC payload arrives.
 */
export function AuthCardSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-12 dark:bg-black">
      <Skeleton className="mb-8 h-6 w-32" />
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-5 pt-2">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
          <Skeleton className="h-11 w-full rounded-md" />
          <Skeleton className="h-3 w-32 self-center" />
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-md" />
            ))}
          </div>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ))}
          <Skeleton className="h-10 w-full rounded-md" />
        </CardContent>
      </Card>
    </div>
  );
}

/** Tab bar placeholder for the tabbed dashboards. */
export function TabsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-28 rounded-md" />
      ))}
    </div>
  );
}
