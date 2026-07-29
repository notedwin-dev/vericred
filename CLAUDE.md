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
npm run dev                  # Start dev server (auto-copies contract config via predev)
npm run build                # Production build
npm run start                # Start production server
npm run lint                 # ESLint
```

## Demo Setup

1. Terminal 1: `npm run node` (Hardhat node at localhost:8545)
2. Terminal 2: `npm run deploy && npm run seed`
3. Set up PostgreSQL, configure `frontend/.env.local` with DB URL + auth secrets
4. Terminal 3: `cd frontend && npx prisma migrate dev && npm run dev`
5. Open http://localhost:3000

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

# Email (SendGrid) — sends the pendingEmail verification link.
# If unset, the verification link is logged to the console instead so the
# flow still works in local dev without a SendGrid account.
SENDGRID_API_KEY=<sendgrid-api-key>
SENDGRID_FROM_EMAIL=<verified-sender-email>
```
