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

Note: email/password signup does **not** currently generate a custody wallet — those users have no `walletAddress` until they separately connect one. The `custodyAddress`/`custodyKeyEnc` columns exist on `User` for this but nothing populates them yet.

### User Identity & Account Linking

- Users can set a `username` (enables a public profile at `/u/[username]`) and a profile picture (uploaded to IPFS via Pinata, see `/api/user/avatar`)
- Wallet-first accounts (signed up via SIWE, no email) can add an email + password from `/dashboard/settings`. The address is staged in `pendingEmail` and only promoted to the real, unique `email` once the user clicks a SendGrid-emailed verification link (`/api/user/email` → `/api/user/email/verify`) — this stops a wallet user from squatting on someone else's address
- Users can link additional OAuth providers to an already-authenticated account from Settings (`/api/user/link-intent` sets a signed cookie, then the normal `signIn(provider)` flow completes; the `signIn` callback in `lib/auth.ts` re-parents the resulting Account row onto the current user instead of creating a second one) and unlink one (blocked if it would leave the account with no remaining sign-in method)
- If an OAuth sign-in's email collides with a different, unrelated existing account, Auth.js's built-in `OAuthAccountNotLinked` safety check fires — VeriCred does **not** auto-merge; the login page shows a message pointing the user to sign in with their original method and link the provider from Settings instead

### Certificate Issuance

- Issuers never supply a CID — `POST /api/certificates` (single) and `POST /api/certificates/batch` (CSV) both generate the certificate PDF server-side (`lib/certificate-pdf.tsx` + `lib/generate-certificate.tsx`, embedding a QR code to `/verify/[credentialId]`) and pin it to IPFS via `lib/ipfs.ts` before the DB row is created — the returned `cid` is always real, or a clearly-marked mock if `PINATA_API_KEY`/`PINATA_SECRET_KEY` aren't set
- `recipientName` is required; `walletAddress` is optional on every issuance path (single, CSV batch, collection-link claim) — the contract's `issueCredential`/`issueCredentialBatch` both revert with `ZeroRecipient()` on a zero address, so a certificate without a wallet simply stays `PENDING` (off-chain only, PDF/CID already generated) until one is known
- **Anchoring, two paths — both attribute correctly to the institution on-chain:**
  - *Interactive* (issuer's own browser has a wallet connected): the single-issue dialog signs `issueCredential` directly; CSV batch issuance signs one `issueCredentialBatch()` for every row that has a wallet, in one MetaMask approval. Either way, the client then `PATCH`es the certificate(s) with `{ txHash }` (see `/api/certificates/[id]`) to flip `PENDING` → `ACTIVE`.
  - *Deferred* (no issuer browser present — a collection-link claim, or a wallet-first user linking a wallet days later): `lib/anchor.ts`'s `autoAnchorCertificate`/`autoAnchorCertificates` sign with the owning **Issuer's own platform-custodied operator wallet** (`Issuer.operatorAddress`/`operatorKeyEnc`, generated + AES-256-GCM-encrypted by `lib/operator-wallet.ts`, decrypted only in-process to sign) — never the platform admin's key. When anchoring several certificates at once, they're grouped by issuer first since one `issueCredentialBatch` transaction can only be attributed to one `msg.sender`. If an issuer has no operator wallet provisioned, matching certificates just stay `PENDING` (logged, not thrown).
  - Provisioning an operator wallet (currently only `prisma/seed.ts` does this — no self-service issuer-creation flow exists yet) requires `ENCRYPTION_KEY` to encrypt it. Funding it with gas money and authorising it on-chain are deliberately separate concerns: the **issuer's own wallet** funds it (in seed data, the known Hardhat Account #1 test key stands in for "the issuer's wallet" — a real institution would send gas money from its own connected wallet, since the platform never holds a real user's private key), while only **admin** can call `authoriseInstitution` (`onlyAdmin` on the contract; admin is auto-authorised as an institution itself in the constructor, which is separately how `ADMIN_PRIVATE_KEY` is used for `/api/institutions`).
- CSV batch format: header row with `name` (required), `email`, `wallet` (both optional, matched case-insensitively) — parsed client-side by `lib/csv.ts`, previewed before submit, capped at 100 rows server-side

### Key Routes

- `/` — Landing (no navbar, sign-in + verify CTAs)
- `/login`, `/register` — Sign in / sign up (both offer WalletConnect + GitHub/Google/LinkedIn + email/password)
- `/verify`, `/verify/[credentialId]` — Public verification
- `/c/[credentialId]` — Public credential page (Accredible-style)
- `/u/[username]` — Public user profile
- `/collect/[token]` — Collection link claim page
- `/dashboard` — User credentials dashboard
- `/dashboard/settings` — Profile, email/password, connected accounts, wallet
- `/issuer` — Issuer panel (courses, templates, issue, collection links)
- `/admin` — Admin panel (institutions, revocation)

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

There's no self-service way to become Admin/Issuer in the app (see Auth's account-linking section) — this script is currently the only way to get one. It's idempotent (safe to re-run) and promotes an existing user in place if one already has the target wallet address, so it won't create duplicates.

| Role | Email | Password | Wallet (matches Hardhat account) |
|---|---|---|---|
| Admin | `admin@vericred.local` | `Admin@12345` | Account #0 — `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Issuer (Asia Pacific University) | `issuer@apu.edu.my` | `Issuer@12345` | Account #1 — `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |

The wallet addresses match `scripts/deploy.js`'s Admin/Registry accounts, so signing in with either MetaMask account (see the private keys below) lands on the matching seeded user instead of creating a new one.

### Hardhat Test Accounts for MetaMask


- Account #0 (Admin): `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- Account #1 (Registry): `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`

## Environment Variables

### Frontend (.env.local)

```dotenv
# Contract (auto-copied from frontend-config/)
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545

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
