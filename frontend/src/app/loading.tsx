import { Skeleton } from "@/components/ui/skeleton";
import { CardListSkeleton } from "@/components/ui/page-skeletons";

/**
 * Root-level loading boundary.
 *
 * This exists specifically to cover `(authenticated)/layout.tsx`, which is an
 * async server component that awaits `auth()` and may `redirect()`. Per Next's
 * docs: "If a layout accesses uncached or runtime data, loading.js will not
 * show a fallback for it, and navigation may block until the layout finishes
 * rendering." A `loading.tsx` wraps its own segment's *children*, so
 * `(authenticated)/dashboard/loading.tsx` sits below that layout and cannot
 * cover it — the boundary has to live at a parent segment, which is here.
 *
 * The usual fixes Next suggests (move the data access into the page, or wrap
 * it in its own Suspense) don't apply: the `auth()` call is a redirect gate for
 * the whole route group, so it must resolve before any child renders. There is
 * nothing to stream around.
 *
 * Concretely: this is what makes clicking "Dashboard" from the landing page
 * change the URL immediately instead of hanging on `/`.
 *
 * Routes with their own nearer boundary (every route under /dashboard,
 * /issuer, /verify, /login, /register, …) keep using theirs — React picks the
 * closest boundary above whatever suspended, so this only fires when the
 * suspension happens above them, i.e. in a layout.
 *
 * Shaped like the authenticated shell (top bar + content) because entering
 * that group is the case it actually fires for.
 */
export default function RootLoading() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Navbar placeholder — the real one lives in (authenticated)/layout. */}
      <header className="sticky top-0 z-40 border-b bg-background/95">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Skeleton className="size-5 rounded-md" />
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="hidden h-7 w-28 rounded-full sm:block" />
            <Skeleton className="size-7 rounded-full" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <CardListSkeleton count={3} />
        </div>
      </main>
    </div>
  );
}
