# VeriCred — Institution Registration & Wallet Architecture PRD

**Module:** CT124-3-3-BCD (Blockchain Development)
**Team:** Group 14, APU
**Status:** Design complete, pending implementation
**Date:** 2026-08-04
**Supplements:** [`PRD.md`](./PRD.md) §F2 (Authentication), §User Roles

---

## 1. Overview

VeriCred's root PRD (`F2: Authentication`) describes WalletConnect/OAuth/email
sign-in, but the current implementation has no self-service path to become an
**Issuer** (institution) — only `frontend/prisma/seed.ts` can create one. This
document specifies a split-screen registration flow that lets someone
register as either an **individual** or an **institution**, and resolves a
set of wallet-architecture gaps that existed before this design pass:

- `Issuer.walletAddress` (the institution's on-chain identity) had zero
  ownership verification anywhere in the codebase — only ever hardcoded by
  the seed script.
- No uniqueness constraint existed between an institution's wallet and any
  user's personal login wallet.
- Registration collected no `username` and, for email/password signup, no
  wallet — deferring both to a settings page nobody is required to visit.
- Email/password accounts had no mandatory email verification, which
  combined with the existing certificate-claim-by-email feature
  (`GET /api/certificates/claimable`, matched purely on `session.user.email`)
  meant anyone could register with a stranger's real email and immediately
  see/claim certificates addressed to that person.

## 2. Goals

- Self-service registration for both individuals and institutions, gated by
  admin approval for institutions (not silent auto-promotion).
- A wallet architecture where an institution's on-chain identity is
  cryptographically proven, funded by the institution itself (not the
  platform), and never ambiguous with a personal login wallet.
- Consistent, mandatory username + wallet collection across every signup
  path (email, OAuth, institution) — no path left incomplete indefinitely.
- Mandatory email verification closing the certificate-claim-by-email gap.

## 3. Non-Goals

- Multi-user-per-institution (staff accounts under one Issuer). `Issuer`
  stays 1:1 with `User` (`userId @unique`).
- Decentralized/DAO-based or staked institution vetting. `authoriseInstitution`
  is `onlyAdmin` on `VeriCred.sol` today (single admin wallet, not multi-sig)
  — removing the admin bottleneck entirely would require new contract
  governance logic, out of scope for this pass.
- Enterprise SSO/SAML or Google-Workspace-domain-restricted OAuth for
  institutions — noted as a good future direction, not built here.
- Redesigning the core on-chain data model (per-credential anchoring with
  `recipient` on-chain) to a Blockcerts-style Merkle-batch scheme. See §4.

## 4. Reference Model Research: Why Not Copy Credly/Blockcerts

Before finalizing the wallet architecture, we compared VeriCred against how
Credly, Blockcerts, and Accredible actually implement "blockchain-verified"
credentials, since those platforms famously never ask a user — issuer or
recipient — to manage a wallet.

**How they actually work:** the recipient never has a wallet; their identity
is never recorded on-chain. The issuing organization doesn't interactively
sign per-credential either — the platform batches many credentials issued in
a period, hashes each one, builds a Merkle tree, and writes **only the
Merkle root** into a single blockchain transaction signed by a
**platform-held key**. Each recipient's credential embeds a Merkle proof
(sibling hashes) linking it to that transaction. Verification recomputes the
Merkle path rather than looking up a wallet — which is also why these
platforms show no explorer link: the raw on-chain data is a hex root shared
by thousands of unrelated credentials, meaningless to a lay verifier.

**Why VeriCred diverges:** `VeriCred.sol` anchors *each* credential
individually and stores the **recipient's own wallet address on-chain** as
part of the `Credential` struct (`recipient`, `transferCredential` — see
root PRD §Smart Contract Interface). That's a deliberate, already-built
design choice, not something this PRD revisits.

On the *issuer* side, VeriCred already has a Credly-equivalent mechanism:
the operator wallet (`Issuer.operatorAddress`, `lib/operator-wallet.ts`) —
platform-custodied, signs on the institution's behalf, zero wallet
management required by the institution for day-to-day anchoring. Where
VeriCred **must** diverge from Credly is funding: Credly's platform-held key
is Credly's own cost to bear indefinitely. VeriCred's operator wallet's
*private key* being platform-custodied is just a signing convenience — it
still needs **gas money** for every anchoring transaction, and this project
explicitly does not want to bear that ongoing operational cost on behalf of
institutions or users. So the institution's own wallet is required at
registration specifically to serve as that funding source (and, optionally,
a path to direct interactive signing) — a deliberate, documented divergence
from the reference model, made for cost/ownership reasons specific to this
project, not because the reference model is wrong.

**Sources:**
[Credly — Blockchain](https://info.credly.com/product/blockchain) ·
[Credly — What is Blockchain?](https://credlyissuer.zendesk.com/hc/en-us/articles/360027938171-What-is-Blockchain) ·
[Blockcerts FAQ](https://www.blockcerts.org/guide/faq.html) ·
[Blockcerts cert-issuer](https://github.com/blockchain-certificates/cert-issuer) ·
[Accredible — Blockchain Verification](https://help.accredible.com/hc/en-us/articles/115003654829-Blockchain-Verification)

## 5. User Roles Affected

Extends root PRD's **Recipient** and **Issuer** roles (§User Roles) with a
formal registration path for each, plus a new **pending institution** state
that only **Admin** can resolve.

## 6. User Flows

### 6.1 Registration chooser — `/register`

Split-screen: two large panels, "I'm an individual" / "I'm an institution."
No form fields on this page — it only routes to §6.2 or §6.3.

### 6.2 Individual registration — `/register/user`

Fields: display name, **username** (required, live availability check),
email, password, confirm password, **wallet connect + sign** (required,
SIWE via `@reown/appkit`) — plus the existing GitHub/Google/LinkedIn OAuth
buttons.

Email/password path → account created with `emailVerified: null` →
mandatory SendGrid verification email → login blocked until verified (§6.5).
OAuth path → account created immediately (adapter default), but routed to
`/onboarding` (§6.4) before reaching any other page.

### 6.3 Institution registration — `/register/institution`

Fields: organization name, logo (optional), contact email (soft-blocked
against a freemail domain list — gmail.com, yahoo.com, outlook.com,
hotmail.com, icloud.com, etc.), username, password, confirm password,
**institution wallet connect + sign** (required, SIWE, proves ownership).

Submission creates `User(role: USER)` + `Issuer(status: PENDING)` — **not**
`role: ISSUER` yet. Mandatory email verification applies (§6.5). The
account cannot reach the issuer dashboard until an admin approves (§6.6).

### 6.4 OAuth onboarding gate — `/onboarding`

OAuth signups (GitHub/Google/LinkedIn) land here immediately after their
first callback if `username` or `walletAddress` is still null. Collects
both (wallet via SIWE signature) before releasing the user to any other
route. Enforced in the `(authenticated)` layout, which today only checks
`session.user` exists — gains a completeness check for OAuth-created
accounts. Institutions never reach this page (no OAuth path for them, §6.3).

### 6.5 Mandatory email verification

Applies to every email/password account (individual or institution).
Extends the existing `pendingEmail` + SendGrid pattern (`lib/email.ts`,
`/api/user/email` → `/api/user/email/verify`) to registration time. The
credentials `authorize()` callback rejects login with a clear
"please verify your email" error while `emailVerified` is null. OAuth
accounts are exempt — `PrismaAdapter` already sets `emailVerified`
automatically since GitHub/Google/LinkedIn vouch for the address.

### 6.6 Admin approval flow

New admin-panel section: **Pending Institutions**, listing every
`Issuer.status === PENDING` row (organization name, contact email, wallet
address, submitted date). Two actions:

- **Approve** — fully synchronous (§7, Decision 7): provisions an operator
  wallet (`lib/operator-wallet.ts`), calls `authoriseInstitution` on-chain
  for *both* the institution's registered wallet and the new operator
  wallet (reusing `/api/institutions`' existing signing logic), and only on
  success flips `User.role → ISSUER` + `Issuer.status → APPROVED` and sends
  the welcome email (§6.7). Any failure leaves the row untouched and
  surfaces an error to the admin.
- **Reject** — sets `Issuer.status → REJECTED` with a mandatory reason
  (consistent with the existing credential-revocation pattern's
  `EmptyReason` requirement), no on-chain action, no role change.

### 6.7 Approval welcome email

HTML/CSS SendGrid email: numbered "what you can do on VeriCred" / benefits
list, white "Get Started" button linking to the issuer dashboard. If the
institution is currently logged in, the button lands directly on
`/issuer`; if not, it routes through `/login` with a `callbackUrl` pointing
there (same pattern already used for OAuth `callbackUrl` redirects).

### 6.8 Institution login

A dedicated login form, separate from `/login` — email + password **and** a
"connect & sign with institution wallet" step, submitted together. Both
must succeed: password match **and** a signature from the wallet currently
registered as `Issuer.walletAddress`. Mismatch or missing signature fails
login outright — stronger than personal wallet-linking's proof-once model,
since it's re-verified on every login.

### 6.9 Changing the institution wallet (post-approval)

From issuer settings: institution proves ownership of a *new* address
(signature), then the system calls `authoriseInstitution(new)` and
`removeInstitution(old)` on-chain before updating `Issuer.walletAddress` in
the DB — all-or-nothing, so an abandoned old wallet is never left authorised
to issue credentials on the institution's behalf.

## 7. Architectural Decisions

Numbered for traceability back to the design interview that produced them.

| # | Decision | Rationale (short) |
|---|---|---|
| 1 | Institution vetting = pending-admin-approval gate, not immediate self-service `ISSUER` | `authoriseInstitution` is already `onlyAdmin` on-chain — some admin step is unavoidable; front-loading it avoids institutions building unusable content |
| 2 | Institution wallet connection is **required** at registration | Operator wallet needs gas money; by design that must come from the institution, not the platform — a documented divergence from Credly's zero-wallet model |
| 3 | Institution wallet linking requires signature proof | `Issuer.walletAddress` currently has zero verification; it's now both on-chain attribution and a funding source |
| 4 | Institution login = email/password **AND** matching wallet signature | Stronger, continuously-reverified identity property; needs its own login form |
| 4a | Institution contact email: soft-blocked freemail list, admin has final discretion | No real domain-ownership verification attempted; admin review is the actual authority |
| 5 | Mandatory email verification blocks login (not just dashboard access) for all email/password accounts | Closes an existing certificate-claim-by-email hijack risk |
| 6 | Approval sends an HTML/CSS SendGrid welcome email with a "Get Started" CTA | Onboarding UX |
| 7 | Approval is fully synchronous — DB + both on-chain calls succeed together or nothing changes | Never tell an institution "you're ready" when they're not |
| 8 | `/register` is a chooser only; routes to `/register/user` / `/register/institution` | Avoids one bloated conditionally-rendered form |
| 9 | Username **and** wallet-linking mandatory for every signup path, no asymmetry | Revises the original spec's Credly-inspired "optional wallet for email signup," which doesn't fit VeriCred's on-chain recipient-identity model or cost constraints |
| 9a | Personal `User.walletAddress` linking also requires signature proof consistently | Fixes a pre-existing gap — `/api/wallet/link`'s signature check is currently optional |
| 10 | Cross-table wallet uniqueness enforced both directions (`Issuer.walletAddress` ⟷ `User.walletAddress`) | A physical address must never be ambiguously "whose wallet is this" |
| 11 | Wallet changes post-approval auto re-authorize on-chain, all-or-nothing | Never leaves an abandoned wallet authorised |
| 12 | Multi-user-per-institution stays out of scope; wallet UI unified on `@reown/appkit`/SIWE; username regex `^[a-z0-9_-]{3,32}$` | Low-controversy defaults, consistent with existing patterns |

## 8. Data Model Changes (Prisma)

```prisma
enum IssuerStatus {
  PENDING
  APPROVED
  REJECTED
}

model Issuer {
  // ...existing fields...
  walletAddress    String       @unique   // was: String (no @unique)
  status           IssuerStatus @default(PENDING)
  rejectionReason  String?                // set only when status = REJECTED
}
```

`User.walletAddress` and `User.username` are unchanged at the schema level
(both already nullable + `@unique`) — the "mandatory" requirement from
Decision 9 is enforced at the application layer (registration/onboarding
flows), not the DB, since existing accounts must remain valid rows.

A new migration must also backfill/verify the single existing seeded
`Issuer` row satisfies the new `@unique` constraint on `walletAddress`
before it can be applied.

## 9. API Surface (new / changed)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/register/user` | POST | Individual registration (replaces current `/api/auth/register`): name, username, email, password, walletAddress+signature |
| `/api/auth/register/institution` | POST | Institution registration: organizationName, logo?, contact email (domain-checked), username, password, walletAddress+signature → `User(role:USER)` + `Issuer(status:PENDING)` |
| `/api/auth/register/verify-email` | GET | Registration-time email verification link handler (extends `pendingEmail` pattern) |
| `/api/onboarding` | POST | OAuth users complete username + wallet after first callback |
| `/api/institutions/pending` | GET | Admin: list `Issuer.status = PENDING` rows |
| `/api/institutions/[id]/approve` | POST | Admin: synchronous approval (§6.6) |
| `/api/institutions/[id]/reject` | POST | Admin: set `REJECTED` + reason |
| `/api/issuer/wallet` | PATCH | Institution: change `Issuer.walletAddress` (signature + auto re-auth, §6.9) |
| `/api/wallet/link` | POST (changed) | Personal wallet linking — signature now required, not optional; adds cross-table uniqueness check against `Issuer.walletAddress` |
| Auth.js `institution` credentials provider | — | New provider in `lib/auth.ts`: validates password AND wallet signature together (§6.8) |

## 10. On-Chain Interaction Summary

```
Institution registration
  -> prove ownership of wallet W (signature)      [off-chain]
  -> User(role:USER) + Issuer(status:PENDING, walletAddress:W) created

Admin approval (synchronous, all-or-nothing)
  -> operator wallet O generated + encrypted       [lib/operator-wallet.ts]
  -> authoriseInstitution(W)                       [on-chain, ADMIN_PRIVATE_KEY]
  -> authoriseInstitution(O)                       [on-chain, ADMIN_PRIVATE_KEY]
  -> User.role -> ISSUER, Issuer.status -> APPROVED
  -> welcome email sent

Institution wallet change: W -> W'
  -> prove ownership of W' (signature)              [off-chain]
  -> authoriseInstitution(W')                       [on-chain]
  -> removeInstitution(W)                           [on-chain]
  -> Issuer.walletAddress = W' (DB update last)
```

Gas for the operator wallet's ongoing anchoring transactions is funded by
the institution transferring funds to address `O` from wallet `W` —
mirroring `prisma/seed.ts`'s existing simulated funding step, now a real
instruction shown to approved institutions rather than a developer-only
script action.

## 11. Out of Scope / Deferred

- Multi-staff accounts per institution (would require an `Issuer` ↔ `User`
  join model, replacing the current 1:1 relation).
- DAO/staking-based decentralized institution vetting (removes the
  single-admin bottleneck at the cost of new contract governance logic).
- Enterprise SSO/SAML, Google-Workspace-domain-restricted OAuth for
  institutions.
- Redesigning the core credential data model toward Blockcerts-style
  Merkle-batch anchoring (would drop on-chain recipient identity entirely
  — a materially different project).

## 12. Verification / Test Plan

- Unit/integration tests (Vitest, per existing `frontend/src/**/*.test.ts`
  patterns) for: registration validation (username regex, freemail
  blocklist, confirm-password mismatch), signature verification on both
  wallet-linking routes, cross-table wallet uniqueness, the
  `emailVerified`-gated login rejection, and the institution `authorize()`
  provider's password+signature AND logic.
- Manual end-to-end on local Hardhat: register an institution → confirm it
  is *not* usable until approved → approve as admin → confirm operator
  wallet funded/authorised on-chain (`isInstitution` mapping) → issue a
  credential → verify it anchors successfully → change the institution
  wallet → confirm the old address no longer passes `isInstitution`.
- Confirm OAuth signup (GitHub/Google/LinkedIn) is blocked from any route
  other than `/onboarding` until username + wallet are set.
