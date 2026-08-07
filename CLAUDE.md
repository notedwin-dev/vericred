# VeriCred — Project Guide

## What is this project?

VeriCred is a blockchain-based Academic Credential Verification System (like Accredible/Credly) for APU module CT124-3-3-BCD, Group 14. It anchors IPFS CIDs of encrypted certificate PDFs on-chain for tamper-proof verification.

## Repository Structure

```text
vericred/
  contracts/VeriCred.sol      # Solidity smart contract (^0.8.24)
  test/VeriCred.test.js       # Hardhat tests (ethers v6, chai)
  scripts/deploy.js           # Deploys contract, exports ABI + address to frontend-config/
  scripts/seed.js             # Seeds 4 demo credentials, revokes 1
  hardhat.config.js           # Solidity 0.8.24, optimizer 200 runs, localhost network
  frontend/                   # Next.js 15 app (App Router, TypeScript, Tailwind, shadcn/ui)
    prisma/schema.prisma      # PostgreSQL schema
    src/app/                  # Pages (App Router)
    src/components/           # React components
    src/lib/                  # Utilities, config, contract helpers
    src/hooks/                # Custom React hooks
```

## Smart Contract (VeriCred.sol)

### Roles

- **Admin** (deployer, Hardhat account #0): authorize/remove institutions, revoke any credential, transfer admin
- **Institution** (authorized wallets, e.g. account #1): issue/revoke credentials
- **Verifier** (anyone, no wallet needed): verify credentials, browse registry

### Key Design Rules

- Certificate PII (name, grades, etc.) stays off-chain in encrypted form referenced by IPFS CID; on-chain data is limited to wallet addresses, IPFS CIDs, and required credential lifecycle metadata (issuer, timestamps, expiry, revocation status/reason)
- CID is the integrity fingerprint (IPFS multihash)
- Credential IDs can be anchored exactly once — no overwrites
- Revocation is append-only — never deletes records
- `exists` and `valid` are separate (distinguishes "never issued" from "revoked" from "expired")
- Removing an institution does NOT void its past credentials
- Credentials have optional expiry (`expiresAt`, 0 = perpetual)
- Credentials track recipient wallet address, supporting transfer for wallet migration

### Custom Errors

NotAdmin, NotAuthorisedInstitution, NotIssuerOrAdmin, CredentialAlreadyExists, CredentialNotFound, CredentialAlreadyRevoked, EmptyCredentialId, EmptyCid, EmptyReason, ZeroAddress, LengthMismatch, NotRecipientOrAdmin, SelfTransfer, InvalidExpiryDate, ZeroRecipient

## Frontend (Next.js 15)

### Tech Stack

- Next.js 15 (App Router), React 19, TypeScript
- Tailwind CSS v4, shadcn/ui, lucide-react
- Auth.js v5 (GitHub/Google/LinkedIn/email+password) + @reown/appkit (WalletConnect) with SIWE
- PostgreSQL + Prisma ORM
- ethers.js v6 for contract interaction
- @react-pdf/renderer for certificate PDFs
- Pinata SDK for IPFS (also used for profile avatar uploads)
- SendGrid (`@sendgrid/mail`) for transactional email (email verification)
- qrcode for QR codes

### Authentication Methods (in UI order)

1. WalletConnect via @reown/appkit (primary, SIWE) — the connected wallet address becomes `walletAddress`
2. GitHub OAuth
3. Google OAuth
4. LinkedIn OAuth
5. Email/password (credentials provider, bcrypt-hashed)
6. **Institution** (`institution` credentials provider) — password **AND** wallet signature together, on its own page at `/login/institution`

Note: email/password signup does **not** currently generate a custody wallet — those users have no `walletAddress` until they separately connect one. The `custodyAddress`/`custodyKeyEnc` columns exist on `User` for this but nothing populates them yet.

### Registration & Sign-in Gates

Implemented per `docs/institution-registration-prd.md`. All authorization rules live in **`lib/auth-credentials.ts`**, which is deliberately framework-free (no `next-auth` import) so it can be tested directly; `lib/auth.ts` only adapts its `AuthorizationError`s into Auth.js's `CredentialsSignin` so the `code` reaches the sign-in URL.

- **`/register` is a chooser only** (no fields) → `/register/user` or `/register/institution`. The old catch-all `POST /api/auth/register` has been **deleted** — it created accounts with no username, no wallet and no email verification, bypassing every gate below.
- **Username + a signature-verified wallet are mandatory on every path.** The two forms collect them directly; OAuth accounts (which have no form step in their callback) are redirected to **`/onboarding`** by the `(authenticated)` layout via `needsOnboarding()` in `lib/onboarding.ts`. ISSUER/ADMIN accounts are exempt — an institution's wallet lives on `Issuer.walletAddress`, not `User.walletAddress`, so requiring one would trap them in an unsatisfiable gate.
- **Email verification blocks login**, not just dashboard access — `authorizeEmailPassword` throws `EmailNotVerified` (see `lib/email-verification.ts` for token issuing, `POST /api/auth/verify-email/resend` for recovery, which always returns 200 so it can't enumerate registered emails). `/api/user/email/verify` serves both this and the older wallet-first email-change flow, branching on whether a `pendingEmail` is staged. **`prisma/seed.ts` sets `emailVerified` on the demo accounts** — without it they could never sign in.
- **Institutions must present password AND a signature from `Issuer.walletAddress` on every login** (unlike personal wallet-linking, which proves ownership once). `authorizeEmailPassword` refuses any account that has an `Issuer` row (`InstitutionMustUseWallet`), so `/login` isn't a way around it. Status is checked *after* the signature verifies: `InstitutionPending` / `InstitutionRejected`.
- **Wallet uniqueness is cross-table** — `findWalletConflict()` in `lib/wallet.ts` checks both `User.walletAddress` and `Issuer.walletAddress` everywhere a wallet is attached, and **reports the issuer match first**. It used to return the user match first, which silently defeated the check: callers treat a `user` conflict that *is* the caller as no conflict ("my own wallet, just re-confirming"), so whenever both rows held an address the institution collision was never seen.
- **An institution's wallet is not a personal login.** `assertWalletIsNotInstitution()` in `lib/auth-credentials.ts` refuses SIWE sign-in with any address on `Issuer.walletAddress`. Without it, signing in on `/login` with an organisation's wallet minted a fresh `USER` account holding that address — leaving the same wallet on both tables and producing an account that could never finish `/onboarding`, because its own wallet permanently collided with the institution's. Institutions sign in at `/login/institution` (password **and** signature).
- **Admin approval is synchronous and all-or-nothing** (`/api/institutions/[id]/approve`): provisions the operator wallet, runs both `authoriseInstitution` calls on-chain, and only then flips `role → ISSUER` + `status → APPROVED` in one transaction and sends the welcome email (`buildInstitutionWelcomeEmail` in `lib/email-templates.ts`). A failed transaction changes nothing.
- **Client-side signing uses `useWalletProof()`** (`hooks/use-wallet-proof.ts`), not AppKit. AppKit is wired with `siweConfig`, so opening its modal *immediately* mints a NextAuth session — correct for "sign in with wallet", wrong for a registration form that has no account yet, and wrong for institution login where the password hasn't been checked yet.

### Navbar & role context

The primary navigation model is a pure function in **`lib/navigation.ts`** (`roleHome`, `roleBadge`, `buildNavItems`, `activeNavHref`), so it can be tested without rendering.

- **The role is a badge on the wordmark, not a tab** — `VeriCred [Issuer]` / `VeriCred [Admin]`. A tab labelled "Issuer" told an issuer what they already knew, and pointed where "Dashboard" already went: `app/(authenticated)/dashboard/page.tsx` redirects ISSUER → `/issuer` and ADMIN → `/admin`, so the two entries were one destination.
- **Dashboard points at `roleHome(role)`**, not `/dashboard`, so privileged roles skip the redirect round-trip. ADMIN keeps a separate Issuer entry, since `/issuer` is a genuinely different area from `/admin`.
- **Active state is longest-prefix** (`activeNavHref`). A first-match scan lit Dashboard *and* Settings simultaneously for an ordinary user, because `/dashboard/settings` also starts with `/dashboard`.

### User Identity & Account Linking

- Users can set a `username` (enables a public profile at `/u/[username]`) and a profile picture (uploaded to IPFS via Pinata, see `/api/user/avatar`)
- Wallet-first accounts (signed up via SIWE, no email) can add an email + password from `/dashboard/settings`. The address is staged in `pendingEmail` and only promoted to the real, unique `email` once the user clicks a SendGrid-emailed verification link (`/api/user/email` → `/api/user/email/verify`) — this stops a wallet user from squatting on someone else's address
- Users can link additional OAuth providers to an already-authenticated account from Settings (`/api/user/link-intent` sets a signed cookie, then the normal `signIn(provider)` flow completes; the `signIn` callback in `lib/auth.ts` re-parents the resulting Account row onto the current user instead of creating a second one) and unlink one (blocked if it would leave the account with no remaining sign-in method)
- If an OAuth sign-in's email collides with a different, unrelated existing account, Auth.js's built-in `OAuthAccountNotLinked` safety check fires — VeriCred does **not** auto-merge; the login page shows a message pointing the user to sign in with their original method and link the provider from Settings instead
- **A *linked* wallet is not a *connected* wallet, and the UI must not conflate them.** `User.walletAddress` is the on-chain identity credentials are issued to; AppKit's `isConnected`/`address` is a live browser connection. They diverge routinely, because `/register/user` and `/onboarding` link a wallet through `useWalletProof` (the injected provider — Rabby/MetaMask directly, *not* the WalletConnect modal, for the reason in that hook), so an account can finish onboarding with a linked wallet while AppKit has never connected to anything. Reading only AppKit's state made the navbar say "Connect Wallet" the moment after a user linked one. `appkit-profile-dropdown.tsx` now shows the linked address muted with a "not connected" subtitle, and `/dashboard/settings` says "Wallet not connected in this browser" rather than "No wallet connected" when a linked wallet exists
- **Signing out tears down the wallet connection first** (`handleSignOut` in `appkit-profile-dropdown.tsx`). AppKit persists its connection independently of the NextAuth cookie, so a plain `signOut` left the wallet connected — and since AppKit is wired with `siweConfig` (`required` defaults true), the next visit to `/login` saw a live connection with no session and immediately demanded a SIWE signature the user never asked for. `ProfileDropdownMenu` takes an optional `onSignOut` so the shared, AppKit-free component keeps working unchanged. Sessions that end *without* going through that button (expiry, `/api/auth/signout`) can still leave a connection behind
- **`siweConfig` sets `signOutOnAccountChange: false` and `signOutOnNetworkChange: false` — do not restore AppKit's `true` defaults.** `siweConfig.getSession` reports `User.walletAddress` as "the SIWE session address", but that column is the account's on-chain identity, not proof this browser authenticated by signing — an email/password user who linked a wallet at `/onboarding` has one too. With the defaults on, AppKit read any divergence between it and the live connection as grounds to end the session: connecting a wallet whose address differed from the linked one signed the user out and bounced them to the landing page, and since `getSession` hardcodes `chainId: CHAIN_ID`, so did connecting while the wallet sat on any other network. Neither is an authentication failure — the cookie is valid throughout. Trade-off: those flags also drive AppKit's mismatch detection in `getSessions`, so connecting a *different* wallet no longer re-prompts for a signature or re-links; changing an account's wallet is a deliberate Settings action. The navbar surfaces the divergence (`isForeignWallet`) rather than hiding it
- **Disconnecting the wallet signs you out**, whatever you originally signed in with. AppKit's `signOutOnDisconnect`/`signOutOnAccountChange` (both default true) call `siweConfig.signOut`, so every disconnect path funnels through that one function. It uses `signOut({ redirectTo: "/" })` and **must keep redirecting** — `{ redirect: false }` clears the cookie but does not re-run `(authenticated)/layout.tsx`, which is an async *server* component, so the user was left on a fully rendered `/dashboard` with the session already gone until a hard refresh. Because the consequence is losing the session, both in-app Disconnect buttons (navbar avatar menu, `/dashboard/settings`) route through `components/wallet/disconnect-wallet-dialog.tsx` to confirm first. That dialog cannot cover AppKit's *own* account-modal Disconnect, which reaches the same sign-out directly

### Certificate Issuance

- Issuers never supply a CID — `POST /api/certificates` (single) and `POST /api/certificates/batch` (CSV) both generate the certificate PDF server-side (`lib/certificate-pdf.tsx` + `lib/generate-certificate.tsx`, embedding a QR code to `/verify/[credentialId]`) and pin it to IPFS via `lib/ipfs.ts` before the DB row is created — the returned `cid` is always real, or a clearly-marked mock if `PINATA_API_KEY`/`PINATA_SECRET_KEY` aren't set. All three issuance paths refuse a mock CID in production, as `/api/user/avatar` already did

### Encrypted certificate artifacts (`docs/encrypted-certificates.md`)

**What is pinned to IPFS is AES-256-GCM ciphertext, not a document.** `generateCertificate` renders the PDF, encrypts it under a fresh per-certificate content key, and pins the result as `<credentialId>.vcenc`. Anyone pulling the artifact off a public gateway gets an opaque blob. This is what the Part 1 proposal promised in five places and the code did not do.

- **`ENCRYPTION_KEY` is now required for all issuance**, not just operator wallets. Losing it makes every existing artifact permanently undecryptable. It is in `.env.test` too, or every issuance test 502s.
- **The privacy split is real**: `Certificate.grade` is rendered onto the encrypted PDF only. The public verify API never returns it and the public preview never draws it. Without a field the public API withholds, encrypting would protect nothing — the PDF otherwise carries only data `/api/verify/[credentialId]` already hands out unauthenticated.
- **Three columns of bookkeeping**: `encKeyEnc` (content key wrapped with `ENCRYPTION_KEY`, same scheme as `Issuer.operatorKeyEnc`), `contentHash` (sha256 of the pinned bytes), `computedCid` (locally recomputed CIDv1). `encKeyEnc IS NULL` marks a **legacy** row whose `cid` points at a plaintext PDF — deliberately not backfilled, since re-encrypting changes the CID that is already anchored immutably on-chain. Legacy rows report integrity as `unavailable/legacy`, never `mismatch`.
- **`lib/prisma.ts` omits `encKeyEnc` globally.** Eight routes end in `NextResponse.json({ certificate })` on a full row; a route must now opt *in* to see the key. Only `lib/certificate-document.ts` does.
- **Public preview is a server-rendered PNG**, not the pinned file: `GET /api/verify/[credentialId]/preview` re-renders from Postgres via `lib/certificate-image.tsx` (satori/`next/og`, Geist from `@fontsource/geist-sans` — satori cannot resolve font names and rejects woff2). ETag is computed before rendering so a repeat request 304s without satori running. Note this means **two renderers draw one design** (`@react-pdf` in Helvetica for the artifact, satori in Geist for the preview); they read the same layout and fields but glyphs differ. Satori also treats `Issued by {name}` as two child nodes and rejects it — every interpolated line must be one template literal.
- **Verification never needs the key.** `lib/integrity.ts` fetches the artifact and re-hashes it; hashing ciphertext is exactly as conclusive as hashing plaintext. Tries `computedCid === chainCid` first (`method: "cid"`), falls back to `contentHash`. `computeCidV1` in `lib/cid.ts` is **best-effort and must never throw** — Pinata does not document its UnixFS parameters and CI cannot check against a live pin, so a divergence degrades the method rather than failing issuance. `rawLeaves: true` + CIDv1 is inferred from real pinned CIDs starting `bafkrei` (base32 + raw codec + sha256).
- **`/api/verify/[credentialId]` now compares the chain and DB CIDs** (`cidAgreement`). It previously let the chain value silently overwrite ours, so a tampered index still rendered "Valid Credential". A mismatch is surfaced, not treated as invalidation — the chain is authoritative and a divergence is far more likely an admin slip than a bad credential.
- **`GET /api/certificates/[id]/document`** returns the decrypted PDF to recipient/issuer/admin. It verifies `contentHash` *before* decrypting and returns 502 rather than falling back to a re-render — a silent fallback would mask exactly the tampering it exists to catch. In local dev without Pinata the CID resolves to nothing, so this path honestly 502s.
- **Sharing is a database grant, not a key hand-off** (`CertificateShare`, `/s/[token]`). The content key never leaves the server, so revoking a share genuinely revokes access. This **deviates from the proposal's** "the graduate is issued the key to unwrap the certificate" — the write-up should say so; the literal design cannot be revoked and leaks the key into browser history.
- `recipientName` is required; `walletAddress` is optional on every issuance path (single, CSV batch, collection-link claim) — the contract's `issueCredential`/`issueCredentialBatch` both revert with `ZeroRecipient()` on a zero address, so a certificate without a wallet simply stays `PENDING` (off-chain only, PDF/CID already generated) until one is known
- **Anchoring, two paths — both attribute correctly to the institution on-chain:**
  - *Interactive* (issuer's own browser has a wallet connected): the single-issue dialog signs `issueCredential` directly; CSV batch issuance signs one `issueCredentialBatch()` for every row that has a wallet, in one MetaMask approval. Either way, the client then `PATCH`es the certificate(s) with `{ txHash }` (see `/api/certificates/[id]`) to flip `PENDING` → `ACTIVE`.
  - *Deferred* (no issuer browser present — a collection-link claim, or a wallet-first user linking a wallet days later): `lib/anchor.ts`'s `autoAnchorCertificate`/`autoAnchorCertificates` sign with the owning **Issuer's own platform-custodied operator wallet** (`Issuer.operatorAddress`/`operatorKeyEnc`, generated + AES-256-GCM-encrypted by `lib/operator-wallet.ts`, decrypted only in-process to sign) — never the platform admin's key. When anchoring several certificates at once, they're grouped by issuer first since one `issueCredentialBatch` transaction can only be attributed to one `msg.sender`. If an issuer has no operator wallet provisioned, matching certificates just stay `PENDING` (logged, not thrown).
  - Provisioning an operator wallet (currently only `prisma/seed.ts` does this — no self-service issuer-creation flow exists yet) requires `ENCRYPTION_KEY` to encrypt it. Funding it with gas money and authorising it on-chain are deliberately separate concerns: the **issuer's own wallet** funds it (in seed data, the known Hardhat Account #1 test key stands in for "the issuer's wallet" — a real institution would send gas money from its own connected wallet, since the platform never holds a real user's private key), while only **admin** can call `authoriseInstitution` (`onlyAdmin` on the contract; admin is auto-authorised as an institution itself in the constructor, which is separately how `ADMIN_PRIVATE_KEY` is used for `/api/institutions`).
- CSV batch format: header row with `name` (required), `email`, `wallet` (both optional, matched case-insensitively) — parsed client-side by `lib/csv.ts`, previewed before submit, capped at 100 rows server-side
- **Claiming a certificate issued by email, no account yet at issuance time:** a certificate can be issued with just `recipientEmail` (no `recipientId`, since no account existed to attach it to). Once someone signs in with that same email, it shows up as "Available to Claim" on their dashboard (`GET /api/certificates/claimable`, matched case-insensitively against `session.user.email`). Claiming (`POST /api/certificates/[id]/claim`) sets `recipientId` and, if the account already has a linked wallet, immediately attempts to anchor via `lib/anchor.ts` — success moves it straight to `ACTIVE`. Without a wallet, or if that anchor attempt fails, it lands on **`CLAIMED`**: a status distinct from `PENDING` meaning "ownership confirmed, not yet blockchain-verified" (`PENDING` means nobody has claimed it at all). `StatusBadge`, `verify-result.tsx`'s `resolveStatus`, and `/c/[credentialId]`'s messaging all treat `CLAIMED` as its own state, not a flavor of `PENDING`.

### Key Routes

- `/` — Landing (no navbar, sign-in + verify CTAs)
- `/login` — Sign in (WalletConnect + GitHub/Google/LinkedIn + email/password)
- `/login/institution` — Institution sign in (password + wallet signature together)
- `/register` — Split-screen chooser only, no fields
- `/register/user` — Individual signup (name, username, email, password, signed wallet) + OAuth/WalletConnect
- `/register/institution` — Institution signup (org name, non-freemail contact email, username, password, signed org wallet); no OAuth by design
- `/onboarding` — Mandatory username + wallet step for OAuth-created accounts; sits **outside** `(authenticated)` or the layout's redirect would loop
- `/verify`, `/verify/[credentialId]` — Public verification
- `/c/[credentialId]` — Public credential page (Accredible-style)
- `/u/[username]` — Public user profile
- `/collect/[token]` — Collection link claim page
- `/dashboard` — User credentials dashboard
- `/dashboard/settings` — Profile, email/password, connected accounts, wallet
- `/issuer` — Issuer panel (courses, templates, issue, collection links)
- `/admin` — Admin panel (institutions, revocation)

### Provider Scoping (dev-performance constraint — don't undo this)

**Never mount `AppKitProvider` or `Web3Provider` in `app/layout.tsx`.** Anything the root layout imports lands in the compilation unit of *every* route. `AppKitProvider`'s module scope calls `createAppKit()`, pulling in `@reown/appkit` (51MB on disk, plus Lit's web components); `Web3Provider` pulls `ethers` (10MB). Both used to live there, which made the static landing page compile the entire WalletConnect stack — 9166 modules and a 47.7s first compile in dev, versus 1147 modules and 4.5s once scoped. It also put ~900kB of AppKit in the production "First Load JS shared by all", so every public credential-verification visitor downloaded it.

Both are mounted per-route instead:

- **`AppKitProvider`** — reached **only** through `next/dynamic`, from exactly three files, each of which imports `@/providers/appkit-provider` itself so init and consumer travel in one chunk and can't race: `components/auth/walletconnect-sign-in-button.tsx` (`/login`, `/register/user`, via the `WalletConnectSignIn` lazy boundary), `components/layout/appkit-profile-dropdown.tsx` (navbar avatar menu), `components/dashboard/appkit-wallet-section.tsx` (`/dashboard/settings`). **Never import `AppKitProvider` from a page.** `/login` and `/register/user` used to do exactly that, statically, which cost `/login` **22.3s of dev compile / 27.0s TTFB** (vs. a ~5s floor for a client route) and put ~100kB of AppKit in its production bundle. Going lazy took it to 13.3s / 15.8s and 143kB. The residual is Turbopack building the chunk during the route compile regardless — stubbing the import out entirely measured 5.0s, so there is no further win available short of dropping WalletConnect from `/login`.
- **`Web3Provider`** (for `useWalletProof` / `useContract`) — per-route layouts under `app/onboarding/`, `app/register/user/`, `app/register/institution/`, `app/login/institution/`, `app/(authenticated)/admin/`, `app/(authenticated)/issuer/`. Deliberately *not* on the shared `(authenticated)` layout, so `/dashboard` doesn't compile ethers.

`frontend/package.json` carries `"overrides": { "viem": "2.55.10", "lit": "3.3.0" }`. `@reown/appkit-siwe@1.8.23` hard-pins *exact* `lit@3.1.0`/`viem@2.45.0` while its sibling `@reown` packages use `3.3.0`/`2.55.10`, so npm installs a duplicate 38MB nested tree and loads two copies of Lit (AppKit's `Multiple versions of Lit loaded` warning). 1.8.23 is the latest published version of every `@reown` package here and still carries the bad pins — re-check with `npm view @reown/appkit-siwe@latest dependencies --json` on any AppKit upgrade and drop the override once fixed. It is a correctness/hygiene fix only: it gave **no** compile-time improvement, because a bundler compiles the import graph, not `node_modules` on disk. Don't remove it without clicking through WalletConnect SIWE sign-in, which the test suite doesn't cover.

`npm run dev` passes `--turbopack` (`dev:webpack` keeps the old bundler, which is still the only way to see module counts in the output). Every route also has a `loading.tsx` — without one there's no Suspense boundary, and the App Router can't commit the new URL until the RSC payload resolves, so the address bar appears frozen for the whole navigation. **`app/loading.tsx` is load-bearing and must not be deleted**: a `loading.tsx` only wraps its segment's *children*, so the per-route files sit below `(authenticated)/layout.tsx` and can't cover its `await auth()` — only a parent-segment boundary can, which is why entering the group from the landing page needs the root one. A side effect is that hard requests to authenticated routes while signed out now return 200 with the redirect streamed inside the RSC payload rather than a 307 header; the gate still works and leaks nothing.

`loading.tsx` does **not** cover the gap between the click and the URL changing — the fallback ships *inside* the RSC payload the router is still waiting for, so until that payload starts streaming the old page sits there looking unclicked (in dev, for the destination's entire first compile; `<Link>` doesn't prefetch in development). **`components/ui/link-button.tsx` covers that gap** — `LinkButton` is a `Button` + `Link` whose label swaps for a spinner via `useLinkStatus()`, which flips on click, before the URL commits. Use `<LinkButton href=…>` for any button that navigates rather than `<Button render={<Link/>} nativeButton={false}>`.

Full analysis, benchmark harness and before/after numbers: `docs/dev-performance.md`.

### Contract Config Pipeline

1. `npx hardhat run scripts/deploy.js --network localhost` writes `frontend-config/contract.json` (ABI + address) and `frontend-config/.env.local`
2. `frontend/scripts/copy-config.js` (runs as npm predev) copies ABI to `src/lib/abi.json` and env vars to `frontend/.env.local`

## Commands

```bash
# Root (Hardhat)
npm install                  # Install Hardhat deps
npm run compile              # Compile contracts
npm run test                 # Run contract tests
npm run node                 # Start local Hardhat node
npm run deploy               # Deploy to localhost
npm run seed                 # Seed demo data

# Root — run the whole stack in one terminal (via `concurrently`)
npm run dev                  # Hardhat node + frontend dev server, in parallel.
                             #   Assumes frontend-config/ already exists from a
                             #   previous deploy — use dev:fresh on a cold start.
npm run dev:fresh            # Cold start: node, then wait-for-node -> deploy ->
                             #   seed -> frontend. Chained, not parallel, because
                             #   the frontend's predev copies frontend-config/,
                             #   which only exists after deploy runs.
npm run wait-for-node        # Polls JSON-RPC until the node answers (used above)

# Frontend
cd frontend
npm install                  # Install frontend deps
npx prisma migrate dev       # Run DB migrations
npx prisma db seed           # Seed an Admin user + Issuer (Asia Pacific University)
npm run dev                  # Start dev server (auto-copies contract config via predev)
npm run build                # Production build
npm run start                # Start production server
npm run lint                 # ESLint
npm run test                 # Vitest integration tests (needs a local Postgres; see prisma/seed.ts and .env.test)
```

## Demo Setup

1. Terminal 1: `npm run node` (Hardhat node at localhost:8545)
2. Terminal 2: `npm run deploy && npm run seed`
3. Set up PostgreSQL, configure `frontend/.env.local` with DB URL + auth secrets
4. Terminal 3: `cd frontend && npx prisma migrate dev && npx prisma db seed && npm run dev`
5. Open http://localhost:3000

### Seeded demo accounts (`npx prisma db seed`, from `frontend/prisma/seed.ts`)

There's no self-service way to become Admin/Issuer in the app (see Auth's account-linking section) — this script is currently the only way to get one, and it's the **only** thing in the codebase allowed to set ADMIN/ISSUER role. Idempotent — matches strictly by its own dedicated email, so re-running it only ever updates the same row.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@vericred.local` | `Admin@12345` |
| Issuer (Asia Pacific University) | `issuer@apu.edu.my` | `Issuer@12345` |

**Deliberately email/password only — neither has a login wallet.** An earlier version matched existing users by wallet address and would silently overwrite whichever account it found (including a real tester's own SIWE-created account) with the seed identity and an elevated role — a real bug the user hit and reported, not a hypothetical. Matching by wallet also meant signing in with the same wallet later (e.g. Hardhat's well-known Account #0/#1 below — exactly what a developer would naturally use to test "regular user connects a wallet") landed on the seeded admin/issuer identity instead of a fresh account. If you need to test the app as admin/issuer with a connected wallet too, link one yourself from `/dashboard/settings` after signing in with the credentials above — don't reintroduce wallet-matching into the seed script.

The Issuer's *organisation* on-chain wallet (`Issuer.walletAddress`, shown as `issuer` on anchored credentials) is still Hardhat Account #1 — that's a separate concept from a `User`'s login wallet and doesn't cause the same collision, since nothing signs in via it.

### Hardhat Test Accounts for MetaMask

Useful for testing wallet sign-in as a plain user, or for linking to the seeded admin/issuer accounts afterward from Settings — but no longer double as those accounts' identity.

- Account #0: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- Account #1: `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`

## Environment Variables

### Frontend (.env.local)

```dotenv
# Contract (auto-copied from frontend-config/)
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545

# Etherscan-style block explorer base URL (e.g. https://sepolia.etherscan.io)
# for the "View on Blockchain Explorer" link on /verify/[credentialId] and
# /c/[credentialId] (lib/config.ts's getExplorerTxUrl, appends /tx/<hash>).
# Unset on local Hardhat (chainId 31337, no explorer exists) — the link is
# simply not rendered rather than pointing somewhere broken.
NEXT_PUBLIC_BLOCK_EXPLORER_URL=

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/vericred

# Auth
NEXTAUTH_SECRET=<random-secret>
NEXTAUTH_URL=http://localhost:3000

# Server-signed on-chain transactions (admin is also an authorised institution
# per VeriCred.sol's constructor). Used by /api/institutions (authorise/remove)
# and, at issuer-provisioning time, to authorise each issuer's own operator
# wallet via authoriseInstitution (onlyAdmin on the contract — no way around
# that). Does NOT fund operator wallets — that comes from the issuer's own
# wallet (see prisma/seed.ts), same as a real institution would. Auto-anchoring
# itself signs with the operator wallet too, not this one (see ENCRYPTION_KEY
# below). Without ADMIN_PRIVATE_KEY, admin-only actions are skipped with a
# console warning, not an error.
ADMIN_PRIVATE_KEY=<admin-wallet-private-key>

# Encrypts each Issuer's platform-custodied operator wallet private key at
# rest (lib/crypto.ts, AES-256-GCM). 32 bytes, hex (64 characters) — generate
# with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
# Without it, operator wallet provisioning (prisma/seed.ts) is skipped and
# deferred anchoring has no signer to use for that issuer.
ENCRYPTION_KEY=<64-hex-character-key>

GITHUB_ID=<github-oauth-app-id>
GITHUB_SECRET=<github-oauth-app-secret>
GOOGLE_CLIENT_ID=<google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
LINKEDIN_CLIENT_ID=<linkedin-app-id>
LINKEDIN_CLIENT_SECRET=<linkedin-app-secret>

# IPFS (Pinata) — also used for profile avatar uploads
PINATA_API_KEY=<pinata-api-key>
PINATA_SECRET_KEY=<pinata-secret-key>

# WalletConnect (via @reown/appkit)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=<walletconnect-cloud-project-id>

# Email (SendGrid) — sends the pendingEmail verification link
# (see /api/user/email, lib/email.ts). If unset:
#   - development: warns and returns without sending (no SendGrid account
#     needed for local testing) — the recipient/URL are deliberately never
#     logged, even here, since the URL carries a bearer token. Check the
#     VerificationToken table directly (e.g. Prisma Studio) if you need it.
#   - production: throws, and /api/user/email returns 503, rather than
#     silently reporting success while sending nothing.
SENDGRID_API_KEY=<sendgrid-api-key>
SENDGRID_FROM_EMAIL=<verified-sender-email>
```
