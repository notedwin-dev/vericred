# Dev server performance

Why `next dev` felt slow, what was changed, and how to re-measure it.

Two separate complaints started this, and they have separate causes. Keeping
them apart matters, because fixing one does nothing for the other:

1. **"The URL doesn't change until the page has loaded."** Clicking a link left
   the address bar on the old route for the whole wait, so there was no signal
   that anything was happening.
2. **"One page takes 20+ seconds to compile."**

---

## 1.0 Navigation felt unresponsive — no `loading.tsx` anywhere

### Cause

The App Router commits the new URL and the new page content as **one atomic
React state update**. From `completeSoftNavigation` in Next's router:

> sets `canonicalUrl` (the browser URL) and `cache` (containing deferred RSC
> promises that trigger `loading.tsx` Suspense fallbacks) in the same state
> object. They are dispatched together atomically.

React can only commit that update once it has something to render. A Suspense
boundary is what lets it commit immediately and show a fallback — and
`loading.tsx` is what creates that boundary. From `LoadingBoundary`:

> If no loading component is provided, children render **without a Suspense
> boundary**.

The app had **zero** `loading.tsx` files. So on every navigation there was no
boundary, nothing to commit, and the URL stayed hostage to the RSC payload —
which, on a cold route in dev, meant 20+ seconds of no feedback at all.

### Fix

Added route-level `loading.tsx` files with skeletons that mirror each page's
real layout:

| Route | File |
|---|---|
| `/dashboard` | `app/(authenticated)/dashboard/loading.tsx` |
| `/dashboard/settings` | `app/(authenticated)/dashboard/settings/loading.tsx` |
| `/issuer` | `app/(authenticated)/issuer/loading.tsx` |
| `/issuer/courses` | `app/(authenticated)/issuer/courses/loading.tsx` |
| `/issuer/courses/[id]` | `app/(authenticated)/issuer/courses/[id]/loading.tsx` |
| `/issuer/templates` | `app/(authenticated)/issuer/templates/loading.tsx` |
| `/admin` | `app/(authenticated)/admin/loading.tsx` |
| `/verify/[credentialId]` | `app/verify/[credentialId]/loading.tsx` |
| `/c/[credentialId]` | `app/c/[credentialId]/loading.tsx` |
| `/u/[username]` | `app/u/[username]/loading.tsx` |
| `/collect/[token]` | `app/collect/[token]/loading.tsx` |
| `/verify` | `app/verify/loading.tsx` |
| `/login`, `/login/institution` | `app/login/loading.tsx` |
| `/register`, `/register/user`, `/register/institution` | `app/register/loading.tsx` |
| `/onboarding` | `app/onboarding/loading.tsx` |

A `loading.tsx` covers its own segment *and* nested segments that don't have a
more specific one — which is why one file at `app/register/` serves all three
register routes, and `issuer/courses/loading.tsx` already covers
`/issuer/courses/new`.

### Why there is a root `app/loading.tsx`

A `loading.tsx` wraps its segment's **children**, not the segment's own layout.
`(authenticated)/layout.tsx` is an async server component that awaits `auth()`,
so from Next's docs:

> If a layout accesses uncached or runtime data, `loading.js` will not show a
> fallback for it, and navigation may block until the layout finishes
> rendering.

That is exactly the "clicking Dashboard from the landing page doesn't change the
URL" symptom: `(authenticated)/dashboard/loading.tsx` sits *below* the layout
that is blocking, so it can never cover it. The boundary has to live at a parent
segment — hence `app/loading.tsx`.

Next's two suggested workarounds don't apply here. Moving the data access into
the page would defeat the point (the `auth()` call is a redirect gate for the
whole group), and wrapping it in its own `<Suspense>` doesn't work either
because the layout has to decide whether to `redirect()` before rendering any
child. There is nothing to stream around.

Routes with a nearer boundary still use theirs — React picks the closest
boundary above whatever suspended, so the root file only fires when a *layout*
suspends.

**Known side effect:** a hard request to an authenticated route while signed out
now returns **200 instead of 307**. Next has to commit the response to stream
the fallback before the layout decides to redirect, so the redirect is delivered
inside the RSC stream (as `/login;307;`) rather than as an HTTP header. Verified:
the redirect still fires and the response body contains only the skeleton — no
authenticated content leaks. Worth knowing if you ever assert on status codes or
point uptime monitoring at those routes.

The auth pages fetch nothing server-side, so their boundary isn't covering a
data wait; it exists purely so the router has something to commit against and
the URL changes on click.

Shared skeleton blocks live in `components/ui/page-skeletons.tsx`. Keep their
shapes roughly aligned with the real page — a skeleton that reflows badly into
the loaded layout reads as a glitch rather than as progress.

**This is the fix that matters most for perceived speed.** It is also the only
one that survives into production, where compile time is zero but data fetching
still takes time.

### Per-link feedback: `components/ui/link-button.tsx`

`loading.tsx` does **not** cover the window between the click and the URL
changing. The App Router will not commit the new URL until the destination's RSC
payload starts streaming, and the loading fallback ships *inside* that payload —
so for that whole window the old page is still on screen, unchanged, with no
sign the click registered. In dev that window is the route's first compile
(`<Link>` does not prefetch in development); in production it is the request.

`useLinkStatus()` (`next/link`) exposes a `pending` boolean to any descendant of
a `<Link>`, and it flips *immediately* on click — measured firing while
`location.pathname` was still the old route. `LinkButton` wraps that up:

```tsx
<LinkButton href="/login" variant="outline">Get Started</LinkButton>
```

It renders `<Button render={<Link/>} nativeButton={false}>` with an inner
component that swaps the label for a centred spinner while `pending`. The label
is hidden with `opacity-0` rather than unmounted so the button keeps its width,
and there is no transition on it — a fade would leave the label visibly
overlapping the spinner drawn on top of it.

**Use `LinkButton` for any button that navigates**, not `Button` + `render`.
The hook must run inside the `<Link>`, so it cannot be lifted into `LinkButton`
itself; that is why the indicator is a child component.

---

## 2.0 Compiles were slow — two causes

### Cause A: dev ran on webpack, not Turbopack

`package.json` had `"dev": "next dev"`. Next 15 defaults to webpack unless you
pass `--turbopack`.

Switching bundlers alone took the landing page's first compile from **47.7s to
27.1s** — a big win for a one-word change, but nowhere near enough on its own.

### Cause B: the root layout dragged the wallet stack into every route

This was the dominant cost. `app/layout.tsx` mounted:

- `AppKitProvider` — whose **module scope** calls `createAppKit()`, pulling in
  `@reown/appkit` (**51MB** on disk) plus its Lit web components
- `Web3Provider` — which imports `ethers` (**10MB**)

Anything imported by the root layout lands in the compilation unit of *every*
route. So the landing page — a static marketing page importing nothing heavier
than three lucide icons — was compiling the entire WalletConnect stack. The
giveaway was `Lit is in dev mode` and `Multiple versions of Lit loaded` printing
while `/` compiled.

Measured directly: removing `AppKitProvider` from the root layout took `/` from
**9166 modules to 1147** (-87%) and its compile from **47.7s to 8.3s** (-83%),
with no other change.

### Fix: scope the wallet stack to the routes that use it

Neither provider is mounted in the root layout any more.

**`AppKitProvider`** is reached only through `next/dynamic`, at every wallet
entry point:

| Where | Lazy chunk |
|---|---|
| `/login`, `/register/user` | `components/auth/walletconnect-sign-in-button.tsx` |
| navbar avatar menu | `components/layout/appkit-profile-dropdown.tsx` |
| `/dashboard/settings` | `components/dashboard/appkit-wallet-section.tsx` |

Each of those three files does `import "@/providers/appkit-provider"` itself.
That is the rule that makes deferral safe: `useAppKit` throws if `createAppKit`
has not run, but because init and consumer sit in the same module graph and load
as one chunk, initialisation always precedes the hook. Deferring the *provider*
alone — with the consumer somewhere else — would race, which is why the two are
never separated.

**`Web3Provider`** (ethers, for `useWalletProof` / `useContract`) moved to
per-route layouts: `app/onboarding/`, `app/register/user/`,
`app/register/institution/`, `app/login/institution/`,
`app/(authenticated)/admin/`, `app/(authenticated)/issuer/`. Note it is on
`/admin` and `/issuer` specifically rather than the shared `(authenticated)`
layout, so `/dashboard` does not compile ethers.

### Follow-up: `/login` and `/register/user` were still importing AppKit statically

The table above is the *current* state. Initially those two routes kept a static
`AppKitProvider` import — the reasoning being that `useAppKit` must not race
`createAppKit`, which is true but is solved by co-locating init and consumer in
one lazy chunk rather than by staying static.

The cost was concentrated on the route a first-time visitor lands on. Measured
with `scripts/measure-dev-compile.mjs --turbopack --isolate`:

| Route | Before | After | Floor for a client route (`/register`, `/verify`) |
|---|---|---|---|
| `/login` compile | 22.3s | 13.3s | ~4.5–5.8s |
| `/login` TTFB | 27.0s | 15.8s | ~7.0–8.8s |

This is what made "Get Started" on the landing page feel broken: the App Router
cannot commit the new URL until the destination's RSC payload begins streaming,
so the browser sat on `/` for the full 27s with no visual change. `/login`'s own
`loading.tsx` could not help — it ships *inside* the payload being waited on. A
`loading.tsx` only covers suspensions *below* its segment; it cannot cover the
time before its own route compiles.

Production improved too: `/login`'s First Load JS went **~240kB → 143kB**, so
someone signing in with email and password no longer downloads AppKit at all.

**Do not expect to remove the remaining ~8s.** Turbopack still builds the lazy
chunk during the route's dev compile. Stubbing the dynamic import out entirely
put `/login` at 5.0s, which pins the residual squarely on AppKit being reachable
from the route at all — the only remaining lever would be not offering
WalletConnect on `/login`, which is not on the table (it is the primary sign-in
method). One side effect in dev: the WalletConnect button renders disabled for
the ~20s Turbopack takes to compile the chunk on demand. In production the chunk
is prebuilt and the swap is imperceptible.

Note this leaves `/register/user` at 14.7s regardless, because its layout mounts
`Web3Provider` for `useWalletProof` — ethers, not AppKit, is that route's floor.

### Production benefit (not just dev)

The same change moved ~900kB of AppKit out of the shared bundle:

```
First Load JS shared by all             104 kB
/dashboard                              136 kB
/issuer                                 127 kB
/verify                                 138 kB
/login                                 1.03 MB   <- AppKit, correctly scoped
/register/user                         1.03 MB   <- AppKit, correctly scoped
```

Before, AppKit sat in "shared by all" — every visitor to the landing page and
every public credential verification downloaded the whole WalletConnect stack.

---

## Measuring it

Two scripts under `frontend/scripts/`:

```bash
# Record a run (writes scripts/.perf-results/<label>.json)
node scripts/measure-dev-compile.mjs --label before --cold
node scripts/measure-dev-compile.mjs --label after --cold --turbopack

# Diff two runs
node scripts/compare-dev-compile.mjs before after
```

The harness boots `next dev`, requests each route, and captures two independent
signals: the dev server's own `✓ Compiled /x in 12.3s` lines (sharp, compile
only) and wall-clock TTFB (blunt, but it is what you actually wait through).
Each route is requested twice so cold-minus-warm isolates compilation from
Postgres and RPC latency.

### Use `--isolate` for per-route numbers

Default (sequential) mode measures all routes against **one** server, so the
first route pays for the whole shared graph and later routes only pay their
delta. Good for totals, misleading per route.

`--isolate` boots a fresh server per route, answering the question a developer
actually asks: *"I opened this page first — how long did I wait?"* ~6x slower to
run, but this is the number to hold against a budget.

```bash
MSYS_NO_PATHCONV=1 node scripts/measure-dev-compile.mjs \
  --label after --turbopack --isolate --cold
```

> On Git Bash for Windows, `MSYS_NO_PATHCONV=1` is required or a `--routes
> /dashboard` argument gets rewritten to `C:/Program Files/Git/dashboard`.

Other flags: `--routes "/a,/b"` to narrow a probe, `--budget 3000` to set the
pass threshold, `--port N`.

---

## Results

Per-route first compile in seconds, `--isolate --cold` (the honest worst case:
a fresh dev server per route, so nothing is shared).

Before = webpack, both providers in the root layout. After = Turbopack, both
providers scoped.

| Route | Before | After | + Defender excl. | Total change |
|---|--:|--:|--:|--:|
| `/` | 28.9 | 4.5 | **4.0** | **-86%** |
| `/verify` | 31.1 | 4.9 | **4.1** | **-87%** |
| `/dashboard` | 32.2 | 15.1 | **13.6** | **-58%** |
| `/issuer` | 32.3 | 15.5 | **13.2** | **-59%** |
| `/register/user` | 31.9 | 21.7 | **19.2** | **-40%** |
| `/login` | 38.9 | 21.2 | **19.9** | **-49%** |
| **Total** | **195.3** | **82.9** | **74.0** | **-62%** |

The last column adds a Windows Defender exclusion for the repo (see below);
it is worth **~11%** on top of the code changes, and is free.

Mean warm (already-compiled) response: **3863ms → 288ms (-93%)**.

The tables in this document are the record of these runs. The raw
`scripts/.perf-results/*.json` files were deleted during a later experiment and
are not checked in; regenerate any you need with the commands above (labels
used here: `00-TRUE-BASELINE-isolate`, `20-FINAL-isolate`,
`30-FINAL-defender-excluded`, `31-floor-defender-excluded`).

> Run-to-run variance is real — repeated `/dashboard` measurements landed at
> 14.1s, 15.1s and 16.5s. Treat differences under ~2s as noise, and re-run
> before concluding a change helped.

---

## About the "under 3 seconds" budget

**It is not reachable on this stack, and the limit is not the app's code.**

A route added purely as a probe, whose entire body was `<div>floor</div>`,
compiled in **3.8s** (4.1s before the Defender exclusion). That is the floor
imposed by React 19 + Next 15 + Tailwind v4 + the root layout's remaining
providers (`next-themes`, next-auth's `SessionProvider`, `sonner`,
`next/font/google`) on this machine. **The floor itself exceeds the 3s budget**,
so no application-level change can meet it.

Against that floor:

- `/` at 4.0s and `/verify` at 4.1s are within **0.2–0.3s of the floor**. The
  public routes are effectively optimal; what remains is framework cost.
- The wallet routes sit at 13–20s because `@reown/appkit` is 51MB and genuinely
  reachable from them. Its compile cost is real work, not waste.

To go below 3s you would have to reduce the floor itself — a lighter root
layout, fewer global providers, or a faster Next/Turbopack release — not
optimise the app.

Two things to keep in mind before treating those numbers as a daily tax:

- **They are first-compile-per-server-restart only.** Once a route is compiled,
  editing it recompiles incrementally and warm navigation was measured at
  ~330ms. You pay the big number once per route per `npm run dev` session.
- **This is dev only.** Production builds are compiled ahead of time; none of
  this applies to a deployed app.

---

## The `viem` / `lit` override in package.json

```json
"overrides": { "viem": "2.55.10", "lit": "3.3.0" }
```

**Why it exists.** `@reown/appkit-siwe@1.8.23` hard-pins *exact* `lit: "3.1.0"`
and `viem: "2.45.0"`, while every sibling `@reown` package uses `lit@3.3.0` and
`viem@2.55.10`. npm therefore installs a duplicate nested tree under
`node_modules/@reown/appkit-siwe/node_modules/` — viem + ox + lit + abitype,
**38MB** — and two copies of Lit get loaded at runtime, which is the
`Multiple versions of Lit loaded` warning AppKit prints on every wallet route.
Lit's own docs call that "not recommended"; duplicate copies can collide on
custom-element registration.

This is upstream's bug and there is nothing to upgrade into: 1.8.23 *is* the
latest published version of all three `@reown` packages we use, and the latest
published `@reown/appkit-siwe` still carries those pins. Re-check on any AppKit
upgrade and drop the override once they fix it:

```bash
npm view @reown/appkit-siwe@latest dependencies --json
```

**What it achieved:** `node_modules/@reown` 51MB → 14MB (-73%), the duplicate
Lit warning gone, faster installs.

**What it did NOT achieve — and this is the useful part:** *no compile-time
improvement whatsoever.* Total compile went 74.0s → 72.9s (-1.5%), inside the
run-to-run variance, with two routes measuring slower.

The reasoning error worth remembering: **disk size is not compile cost.** A
bundler compiles what is reachable from the import graph, not what is on disk.
Only one copy of viem/lit was ever imported; the duplicate 38MB simply sat
there being ignored by Turbopack. Do not assume a fat `node_modules` is a slow
build — measure the import graph instead.

> Caveat: an override forces a package to run against dependency versions its
> author pinned exactly. Both are minor bumps within the same major, and the
> build plus all 105 tests pass — but the suite does not exercise WalletConnect
> SIWE sign-in end to end. Click through that flow after any AppKit change.

### How much is AppKit actually costing? (measured)

To size the prize, the wallet UI was temporarily rewritten to drop
`@reown/appkit` entirely and drive connection from the app's own
`Web3Provider` (raw EIP-1193 + ethers, which `useWalletProof` already uses),
then measured and reverted:

| Route | With AppKit | Without AppKit | Floor |
|---|--:|--:|--:|
| `/login` | 19.9s | **4.6s** | 3.8s |
| `/register/user` | 19.2s | **4.7s** | 3.8s |
| `/dashboard` | 13.6s | **6.3s** | 3.8s |
| `/issuer` | 13.2s | **6.3s** | 3.8s |

So AppKit is **~15s on the two routes that import it eagerly** and ~7s on the
routes that only reach it through `next/dynamic`. Without it, `/login` and
`/register/user` land within ~0.8s of the framework floor — essentially all of
their compile cost is AppKit.

The `/dashboard` and `/issuer` figures independently reproduce an earlier probe
that severed AppKit from the navbar (6.9s and 7.1s), which is good evidence the
method is sound.

This is a measurement, not a recommendation — dropping AppKit means giving up
WalletConnect and its SIWE flow, which is a product decision, not a perf one.

### AppKit tuning that was checked and found already done

Common advice for shrinking AppKit — all of it was already true here, so none
of it was available as a win:

- **EVM-only adapters.** Only `EthersAdapter` is registered; no Solana or
  Bitcoin adapter is imported.
- **Disable unused features.** `analytics`, `email`, `socials`, `swaps` and
  `onramp` are already `false` in `providers/appkit-provider.tsx`. Note these
  are *runtime UI toggles*, not build-time flags — per Reown's docs they change
  what the modal renders, and do not tree-shake anything out of the bundle, so
  they would not have moved compile time regardless.
- **Latest version.** All three `@reown` packages are on 1.8.23, which is the
  latest published.

### What was tried and rejected

- **`next/dynamic` for the navbar's AppKit menu** — kept, but it only got
  `/dashboard` to 15.1s, not the 6.9s that fully removing AppKit achieved.
  Turbopack still compiles dynamically-imported chunks during the route's
  initial compile; it splits the bundle without deferring compilation. Worth
  ~12s, so it stays, but it is not a complete escape.
- **`experimental.turbopackPersistentCaching`** — would make restarts near
  instant, but errors with `CanaryOnlyError` on stable 15.5.22. Revisit if the
  project moves to a canary or a version where it ships.

### If you need to go further

In rough order of expected value:

1. ~~**Add Windows Defender exclusions**~~ — **done**, and measured at **-11%**
   overall (total compile 82.9s → 74.0s; the floor probe 4.1s → 3.8s). If you
   ever work on a clone at a different path, redo it there:
   ```powershell
   Add-MpPreference -ExclusionPath "D:\Programming\vericred"
   ```
   Real-time protection stays on globally; only this tree is skipped. Several
   individual route deltas fall inside run-to-run variance — the aggregate is
   the trustworthy figure.
2. **Replace `@reown/appkit`** with a lighter connector for local dev, or gate
   it behind an env flag so day-to-day work on non-wallet features never
   compiles it. This is the only change that would meaningfully move the wallet
   routes — configuration tuning has been exhausted (see the section above; the
   EVM-only adapter, disabled features and latest version were all already in
   place, and deduping its 38MB of duplicate deps changed nothing).
3. **Self-host the fonts** instead of `next/font/google` to cut a network fetch
   out of cold boot.
4. **Upgrade Next.js.** Turbopack's dev performance and its persistent cache are
   both moving quickly.

### If a regression appears

Re-run `--isolate` and compare against `scripts/.perf-results/`. If a route
jumps, the usual cause is a heavy import newly reachable from a shared layout.
To find it, temporarily stub the suspect provider or import in the layout and
re-measure that one route with `--routes` — that A/B is what localised both
causes above.

Watch the module counts in the webpack output (`✓ Compiled / in 8.3s (1147
modules)`) — a sudden jump there points straight at the culprit. Turbopack does
not print module counts, so use `npm run dev:webpack` when you need them.
