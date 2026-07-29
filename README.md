# VeriCred

Blockchain-anchored academic credential verification — issue, verify, and revoke certificates with tamper-proof, on-chain proof.

## Overview

VeriCred is a blockchain-based Academic Credential Verification System, similar to Accredible or Credly. Universities and organizations issue certificates as encrypted PDFs stored on IPFS; only the file's content fingerprint (IPFS CID) is anchored on-chain. Anyone — an employer, a recruiter, another institution — can verify a credential in seconds without contacting the issuer, while the underlying personal data never touches the public ledger.

Built for module **CT124-3-3-BCD (Blockchain Design and Development)**, Group 14, APU.

## Key Features

- **Tamper-proof verification** — credential integrity is checked against an IPFS CID anchored on-chain; any change to the certificate file invalidates the fingerprint
- **Public verification** — anyone can verify by credential ID or QR code, no account or wallet required
- **Multiple sign-in methods** — WalletConnect (SIWE), GitHub, Google, LinkedIn, or email/password with an auto-generated custody wallet
- **Course-centric issuance** — templates → courses → single or batch certificate issuance (CSV upload supported)
- **Collection links** — shareable claim links with configurable collection limits, link expiry, and certificate expiry
- **Wallet migration** — recipients can link a new wallet and transfer their credentials on-chain via `transferCredential`
- **Revocation with audit trail** — issuers or admin can revoke a credential with a mandatory reason; records are never deleted
- **Blockchain transparency** — every credential page shows the IPFS CID, transaction hash, block number, and contract address
- **LinkedIn integration** — one-click "Add to Profile" for verified credentials

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contract | Solidity ^0.8.24, Hardhat, ethers.js v6 |
| Frontend | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4, shadcn/ui, lucide-react |
| Auth | Auth.js v5, WalletConnect / SIWE, bcrypt |
| Database | PostgreSQL, Prisma ORM |
| PDF Generation | @react-pdf/renderer |
| IPFS Storage | Pinata SDK |
| QR Codes | qrcode |

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

## Prerequisites

- Node.js 18 LTS or newer
- npm 9 or newer
- PostgreSQL (local instance or hosted)
- MetaMask (or another WalletConnect-compatible wallet) for on-chain interactions

## Getting Started

### 1. Install and start the local blockchain

```bash
npm install
npm run node          # starts a local Hardhat node at http://127.0.0.1:8545
```

### 2. Deploy the contract and seed demo data

In a second terminal:

```bash
npm run deploy         # deploys VeriCred.sol, writes ABI + address to frontend-config/
npm run seed            # seeds 4 demo credentials, revokes 1
```

### 3. Set up the frontend

In a third terminal:

```bash
cd frontend
npm install
npx prisma migrate dev  # apply the PostgreSQL schema
npm run dev              # auto-copies contract config, starts dev server
```

Configure `frontend/.env.local` with your database URL and auth secrets (see [Environment Variables](#environment-variables)) before running `npm run dev`.

### 4. Open the app

Visit [http://localhost:3000](http://localhost:3000).

### Other useful commands

```bash
# Root (Hardhat)
npm run compile       # Compile contracts
npm run test           # Run contract tests

# Frontend
cd frontend && npm run build   # Production build
```

### Import test accounts into MetaMask

| Role | Private Key |
|---|---|
| Admin (Account #0) | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| Registry (Account #1) | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |

Add a custom network in MetaMask: RPC URL `http://127.0.0.1:8545`, chain ID `31337`.

## Environment Variables

Set these in `frontend/.env.local`:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Deployed VeriCred contract address (auto-copied from `frontend-config/`) |
| `NEXT_PUBLIC_CHAIN_ID` | Chain ID of the target network (`31337` for local Hardhat) |
| `NEXT_PUBLIC_RPC_URL` | JSON-RPC endpoint (`http://127.0.0.1:8545` for local) |
| `DATABASE_URL` | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Random secret used to sign Auth.js sessions |
| `NEXTAUTH_URL` | Base URL of the app (`http://localhost:3000` in dev) |
| `GITHUB_ID` / `GITHUB_SECRET` | GitHub OAuth app credentials |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth client credentials |
| `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` | LinkedIn OAuth app credentials |
| `PINATA_API_KEY` / `PINATA_SECRET_KEY` | Pinata API credentials for IPFS uploads |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect Cloud project ID |

The contract config (`NEXT_PUBLIC_CONTRACT_ADDRESS`, `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_RPC_URL`) is generated by `scripts/deploy.js` into `frontend-config/`, then copied into the frontend by `frontend/scripts/copy-config.js` (runs automatically as a `predev` step).

## Smart Contract Overview

`contracts/VeriCred.sol` anchors only the data required to prove a credential's authenticity — issuer address, recipient address, IPFS CID, timestamps, expiry, and revocation status. All personally identifiable information (names, grades, etc.) stays off-chain, encrypted, and referenced by CID.

### Roles

| Role | Capabilities |
|---|---|
| **Admin** | Authorize/remove institutions, revoke any credential, transfer admin role |
| **Institution (Issuer)** | Issue and revoke its own credentials |
| **Verifier (public)** | Verify any credential and browse the registry for free — no account or wallet required |
| **Recipient** | Holds credentials; can transfer them to a new wallet |

### Key Functions

| Function | Access | Purpose |
|---|---|---|
| `issueCredential(id, cid, recipient, expiresAt)` | Institution | Anchor a single credential |
| `issueCredentialBatch(...)` | Institution | Anchor a batch of credentials in one transaction |
| `revokeCredential(id, reason)` | Issuer or Admin | Revoke with a mandatory reason (append-only) |
| `transferCredential(id, newRecipient)` | Recipient or Admin | Migrate a credential to a new wallet |
| `verifyCredential(id)` | Anyone (free) | Returns exists, valid, cid, issuer, issuedAt, recipient, expiresAt |
| `getCredential(id)` / `isValid(id)` | Anyone (free) | Full record / boolean validity check |
| `getCredentialsPaged(offset, limit)` | Anyone (free) | Paginated registry browse |
| `authoriseInstitution(addr)` / `removeInstitution(addr)` | Admin | Manage institution issuing rights |
| `transferAdmin(addr)` | Admin | Transfer admin role |

Design rules: credential IDs can be anchored exactly once (no overwrites), revocation never deletes records, `exists` and `valid` are tracked separately, and removing an institution does not void its past credentials.

See `CLAUDE.md` for the full technical guide and `PRD.md` for the complete feature list (F1–F15) and demo flow.

## User Roles

| Role | Who | What they do |
|---|---|---|
| **Admin** | Platform administrator | Authorizes institutions, has override revocation authority, transfers admin role |
| **Institution / Issuer** | University, event organizer, organization | Creates templates and courses, issues certificates (single or batch), generates collection links, revokes its own credentials |
| **Recipient** | Student / professional | Claims and holds credentials, downloads PDFs, shares to LinkedIn, links/migrates wallet |
| **Verifier** | Anyone (public/employer) | Verifies a credential by ID or QR code — no account or wallet needed |

## License

MIT — see [LICENSE](./LICENSE).

## Team

Group 14, APU — Module CT124-3-3-BCD (Blockchain Design and Development)
