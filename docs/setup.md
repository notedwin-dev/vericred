# VeriCred — Setup Guide

**Module:** CT124-3-3-BCD — Blockchain Development
**Group:** 14 · Asia Pacific University of Technology and Innovation
**Companion documents:** [`assumptions.md`](./assumptions.md) · [`design.md`](./design.md) · [`PRD.md`](./PRD.md)

---

## What you are setting up

VeriCred has three moving parts that must be running or provisioned before the application works:

1. A **local Hardhat blockchain node**, with `VeriCred.sol` deployed to it
2. A **PostgreSQL database**, migrated and seeded
3. The **Next.js application**, configured to reach both

They are brought up in that order because each depends on the one before it. The application reads the contract address and ABI from files that only exist once a deployment has run, and it cannot start meaningfully against an unmigrated database.

Total time from clean checkout to running application: roughly **10–15 minutes**, most of which is `npm install`.

---

## 1.0 Prerequisites

| Requirement | Minimum | Check with | Notes |
|---|---|---|---|
| Node.js | 18.18.0 | `node --version` | Required by Next.js 15. Version 20 LTS or newer recommended. |
| npm | 9 | `npm --version` | Ships with Node. |
| PostgreSQL | 14 | `psql --version` | Local instance or hosted. |
| Git | any | `git --version` | |
| MetaMask | current | browser extension | Only needed for interactive on-chain signing. Public verification needs no wallet. |
| Visual Studio Code | current | — | Specified by the module's development stack. |

> **Windows note.** All commands below work in PowerShell, Command Prompt, and Git Bash. Where a command differs by shell, both forms are given.

---

## 2.0 Clone and install

Two separate dependency trees exist and **both** must be installed. The root tree carries the Hardhat toolchain; `frontend/` carries the application.

```bash
git clone https://github.com/notedwin-dev/vericred.git
cd vericred

# Root — Hardhat toolchain
npm install

# Application
cd frontend
npm install
cd ..
```

A common first mistake is installing only at the root and then finding that `npm run dev` in `frontend/` cannot resolve Next.js. Install both.

---

## 3.0 Compile and test the contract

Confirm the Solidity toolchain works before going further.

```bash
npm run compile     # hardhat compile
npm run test        # hardhat test
```

Expected output ends with:

```
  64 passing (2s)
```

Compilation writes to `artifacts/` and `cache/`, both git-ignored. Successful compilation confirms the Solidity 0.8.24 compiler and the optimiser settings in `hardhat.config.js` are working.

---

## 4.0 Start the blockchain and deploy

### 4.1 Start the node

In a terminal you will leave running:

```bash
npm run node
```

This starts a Hardhat node at `http://127.0.0.1:8545` (chain ID `31337`) and prints twenty pre-funded test accounts with their private keys. Leave this terminal open — closing it destroys all chain state.

### 4.2 Deploy the contract

In a **second** terminal:

```bash
npm run deploy      # hardhat run scripts/deploy.js --network localhost
```

Expected output:

```
Network : localhost (chainId 31337)
Deployer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Balance : 10000.0 ETH

VeriCred deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Gas used            : ...
Admin               : 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Registry authorised : 0x70997970C51812dc3A010C7d01b50e0d17dc79C8

Wrote frontend-config/contract.json and .env.local
```

The deploy script does four things: deploys the bytecode, authorises Hardhat Account #1 as a second institution so the demonstration has a distinct issuer, writes `frontend-config/contract.json` (address, chain ID, ABI), and writes `frontend-config/.env.local`.

**Record the deployed address.** You will see it again in `frontend/.env.local`.

### 4.3 Seed demonstration credentials (optional)

```bash
npm run seed        # seeds 4 demo credentials on-chain, revokes 1
```

This populates the on-chain registry so `/verify` has something to find before you issue anything yourself.

---

## 5.0 Provision the database

### 5.1 Create the database

```bash
createdb vericred
```

Or from `psql`:

```sql
CREATE DATABASE vericred;
```

For the test suite, also create:

```bash
createdb vericred_test
```

### 5.2 Configure the connection string

The migration step needs `DATABASE_URL` before it can run, so configure the environment first — see 6.0 — then return here.

### 5.3 Apply migrations

```bash
cd frontend
npx prisma migrate dev
```

This applies all eight migrations in order and regenerates the Prisma client. Expected tail:

```
All migrations have been successfully applied.
✔ Generated Prisma Client
```

### 5.4 Seed the application accounts

```bash
npx prisma db seed
```

This creates the two privileged accounts you need in order to see the issuer and administrator interfaces. There is **no self-service route to either role**, so this step is not optional if you want to demonstrate issuance.

| Role | E-mail | Password |
|---|---|---|
| Administrator | `admin@vericred.local` | `Admin@12345` |
| Issuer (Asia Pacific University) | `issuer@apu.edu.my` | `Issuer@12345` |

Both are e-mail/password accounts with **no login wallet** — deliberately. The script matches strictly on its own two e-mail addresses and is idempotent, so re-running it updates the same two rows rather than creating duplicates or appropriating an account you created by signing in.

If `ENCRYPTION_KEY` is set (see 6.0), the seed also provisions and funds the issuer's operator wallet and authorises it on-chain. If it is not set, that step is skipped with a warning and deferred anchoring will have no signer.

---

## 6.0 Environment configuration

Create `frontend/.env.local`. Start from the template:

```bash
cd frontend
cp .env.example .env.local
```

### 6.1 Variables written for you

`scripts/deploy.js` writes these into `frontend-config/`, and `frontend/scripts/copy-config.js` merges them into `.env.local` automatically on every `npm run dev`. **You do not need to set them by hand.**

```dotenv
NEXT_PUBLIC_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
```

### 6.2 Variables you must set

```dotenv
# PostgreSQL
DATABASE_URL=postgresql://postgres:password@localhost:5432/vericred

# Auth.js session signing
NEXTAUTH_SECRET=<random-secret>
NEXTAUTH_URL=http://localhost:3000

# REQUIRED for all certificate issuance — 32 bytes, hex (64 characters)
ENCRYPTION_KEY=<64-hex-character-key>
```

Generate the two secrets:

```bash
# NEXTAUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **`ENCRYPTION_KEY` is backup-critical.** It wraps every per-certificate content key and every operator wallet private key. Issuance **fails without it**. Losing it makes every existing certificate artifact permanently undecryptable — the public preview still renders from PostgreSQL, but the authoritative pinned document is gone for good.

### 6.3 Variables that are optional

Everything below degrades gracefully when unset. The application runs without any of them.

```dotenv
# Server-side signing of admin-only on-chain calls (authoriseInstitution,
# removeInstitution). Without it, institution approval returns HTTP 501 with
# an actionable message rather than failing opaquely.
# For local development, use Hardhat Account #0:
ADMIN_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# IPFS pinning. Without these, a clearly-marked mock CID is produced so the
# full issuance flow still works locally. Refused in production.
PINATA_API_KEY=
PINATA_SECRET_KEY=

# WalletConnect Cloud project ID. Without it, the WalletConnect modal will
# not open; the injected-wallet path (MetaMask/Rabby directly) still works.
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# OAuth providers — each is independently optional.
GITHUB_ID=
GITHUB_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=

# Transactional e-mail. Unset in development, verification e-mail is skipped
# with a warning (and the URL is never logged, as it carries a bearer token) —
# query the VerificationToken table directly if you need the link. In
# production, unset causes a 503 rather than a silent no-op.
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=

# Block explorer base URL for the "View on Blockchain Explorer" link. Leave
# unset on local Hardhat — no explorer exists for chain 31337, and the link is
# simply not rendered.
NEXT_PUBLIC_BLOCK_EXPLORER_URL=
```

### 6.4 Test environment

`npm run test` in `frontend/` reads `.env.test`, which needs its own database and its own `ENCRYPTION_KEY` — without the latter, every issuance test returns 502.

```dotenv
DATABASE_URL=postgresql://postgres:password@localhost:5432/vericred_test
ENCRYPTION_KEY=<64-hex-character-key>
NEXTAUTH_SECRET=<any-value>
NEXTAUTH_URL=http://localhost:3000
```

---

## 7.0 Run the application

```bash
cd frontend
npm run dev
```

The `predev` hook runs `scripts/copy-config.js` first, copying the ABI to `src/lib/abi.json` and merging the `NEXT_PUBLIC_*` values into `.env.local`. Then Next.js starts with Turbopack.

Open **http://localhost:3000**.

### 7.1 Running everything from one terminal

Two orchestrated scripts exist at the repository root, using `concurrently`:

```bash
npm run dev          # Hardhat node + application in parallel
npm run dev:fresh    # Cold start: node → wait-for-node → deploy → seed → application
```

Use `dev:fresh` on a first run or after wiping chain state. The two differ because `dev:fresh` must be **chained rather than parallel**: the application's `predev` hook copies `frontend-config/`, which only exists after `deploy` has run.

---

## 8.0 Configure MetaMask

Only needed to sign transactions interactively. Public verification works without any wallet.

### 8.1 Add the local network

| Field | Value |
|---|---|
| Network name | Hardhat Local |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency symbol | ETH |

### 8.2 Import a test account

**Account → Import Account → Private Key:**

| Account | Role | Private key |
|---|---|---|
| #0 | Administrator | `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| #1 | Academic Registry (issuer) | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |

> **Warning.** These are Hardhat's publicly documented development keys. They are safe **only** on a local chain. Never use them on a public network — anyone can spend from them.

To sign issuance as the seeded issuer, sign in as `issuer@apu.edu.my` and link Account #1 from `/dashboard/settings`. The seed script deliberately does not attach a login wallet to either privileged account.

---

## 9.0 Verify the installation

Work through these in order. Each confirms one layer.

| # | Check | Command or action | Expected |
|---|---|---|---|
| 1 | Contract compiles | `npm run compile` | `Compiled ... successfully` |
| 2 | Contract behaves | `npm run test` | `64 passing` |
| 3 | Node is up | `curl -s -X POST http://127.0.0.1:8545 -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'` | `{"jsonrpc":"2.0","id":1,"result":"0x7a69"}` (`0x7a69` = 31337) |
| 4 | Contract is deployed | `cat frontend-config/contract.json \| head -3` | An `address` field |
| 5 | Config reached the app | `cat frontend/src/lib/abi.json \| head -3` | A non-empty array |
| 6 | Database is migrated | `cd frontend && npx prisma migrate status` | `Database schema is up to date!` |
| 7 | Application tests pass | `cd frontend && npm run test` | `214 passed` |
| 8 | Application serves | Open `http://localhost:3000` | Landing page, no navbar |
| 9 | Sign-in works | Sign in as `issuer@apu.edu.my` | Redirects to `/issuer` |
| 10 | Public verification works | Open `/verify` and enter a seeded credential ID | A verification result |

---

## 10.0 First run: issue and verify a credential

The shortest path to seeing the system work end-to-end.

1. Sign in at `/login` as `issuer@apu.edu.my` / `Issuer@12345`. You land on `/issuer`.
2. Create a **template** (`/issuer/templates` → New). Any name; the layout fields have sensible defaults.
3. Create a **course** (`/issuer/courses` → New), linked to that template.
4. Open the course and click **Issue Certificate**. Enter a recipient name; optionally a grade and a wallet address.
   - The server renders the PDF, encrypts it, pins it to IPFS, and stores the row. The certificate appears with status `PENDING`.
   - If a wallet is connected **and** you supplied a recipient wallet address, MetaMask prompts you to sign `issueCredential`. On confirmation the status becomes `ACTIVE`.
5. Copy the credential ID (format `VC-2026-XXXXXXXX`).
6. Open a **private browsing window** — no account, no wallet — and visit `/verify/<credentialId>`. You should see the verification result with issuer, date, CID and transaction hash.

> **Note on step 6 for revocation.** If you revoke the certificate and re-verify, the page will show "Revoked". Be aware that this verdict currently comes from the off-chain index only — the on-chain `revokeCredential` transaction is **not yet wired into the application**. See [`assumptions.md`](./assumptions.md) 7.1.

---

## 11.0 Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Contract ABI is empty. Run npm run predev...` | The contract has not been deployed, so `src/lib/abi.json` is still `[]`. | Run `npm run deploy` at the root, then restart `npm run dev`. |
| `NEXT_PUBLIC_CONTRACT_ADDRESS is not set` | `copy-config.js` found no `frontend-config/`. | Same as above. The script no-ops silently by design so a fresh checkout still starts. |
| `could not detect network` / `ECONNREFUSED 127.0.0.1:8545` | The Hardhat node is not running. | Start `npm run node` in its own terminal. |
| Verification says "not found" for a credential you just issued | The node was restarted, wiping chain state, or the contract was redeployed to a new address. | Redeploy and re-issue. Chain state does not survive a node restart. |
| MetaMask: "nonce too high" | Chain state was reset under MetaMask's feet. | MetaMask → Settings → Advanced → **Clear activity tab data**. |
| Issuance returns 502 `Failed to generate certificate PDF` | `ENCRYPTION_KEY` is unset or not 64 hex characters. | Set it in `.env.local` (and `.env.test`) and restart. |
| Issuance returns 503 in production | Pinata is unconfigured and a mock CID was produced. | Set `PINATA_API_KEY` / `PINATA_SECRET_KEY`. Mock CIDs are refused in production by design. |
| Institution approval returns HTTP 501 | `ADMIN_PRIVATE_KEY` or `ENCRYPTION_KEY` is unset. | Set both. `authoriseInstitution` is `onlyAdmin` on the contract, so there is no way around admin signing. |
| Certificate download returns 502 in local development | The mock CID resolves to nothing on any gateway. | Expected without real Pinata credentials. The route fails honestly rather than falling back to a re-render, which would mask genuine retrieval failures. |
| `P1001: Can't reach database server` | PostgreSQL is not running, or `DATABASE_URL` is wrong. | Start PostgreSQL; check host, port, user, password and database name. |
| `prisma migrate dev` reports drift | The database was modified outside Prisma. | `npx prisma migrate reset` — **destroys all data** — then re-seed. |
| Application tests fail on connection | `vericred_test` does not exist or `.env.test` is missing. | `createdb vericred_test` and create `.env.test` per 6.4. |
| Signed in, but redirected to `/onboarding` repeatedly | An OAuth account has no username or linked wallet. | Complete the onboarding form. Both are mandatory for `USER` accounts. |
| Wallet connects, then immediately signs you out | Historically caused by AppKit's `signOutOnAccountChange` defaults. | Already handled — both flags are set to `false`. If it recurs, check `lib/siwe-config.ts` has not been reverted. |
| Dev server very slow to compile a route | Expected on first compile in development; `<Link>` does not prefetch in dev. | See [`dev-performance.md`](./dev-performance.md). Adding a Windows Defender exclusion for the repository is worth roughly 11%. |

---

## 12.0 Resetting

### Reset the chain only

Stop `npm run node`, restart it, then:

```bash
npm run deploy && npm run seed
```

All previously anchored credentials are gone. Existing PostgreSQL rows will still hold their old `cid` and `txHash` and will verify as off-chain-only.

### Reset the database only

```bash
cd frontend
npx prisma migrate reset      # destroys all data, re-applies migrations, re-seeds
```

### Full reset

```bash
# Stop the node, then:
rm -rf artifacts cache frontend-config frontend/.next
cd frontend && npx prisma migrate reset && cd ..
npm run dev:fresh
```

---

## 13.0 Command reference

```bash
# ── Root (Hardhat) ────────────────────────────────────────────────
npm install                  # Install the Hardhat toolchain
npm run compile              # Compile contracts
npm run test                 # 64 contract tests
npm run node                 # Local node on :8545
npm run deploy               # Deploy; export ABI + address
npm run seed                 # 4 demo credentials, 1 revoked
npm run wait-for-node        # Poll JSON-RPC until responsive
npm run dev                  # Node + application in parallel
npm run dev:fresh            # Cold start, chained

# ── Application (frontend/) ───────────────────────────────────────
npm install                  # Install dependencies
npx prisma migrate dev       # Apply 8 migrations
npx prisma migrate status    # Check migration state
npx prisma migrate reset     # Destroy and rebuild (destructive)
npx prisma db seed           # Admin + Issuer accounts
npx prisma studio            # Browse the database in a GUI
npm run dev                  # Dev server (predev copies config)
npm run dev:webpack          # Dev server on webpack (shows module counts)
npm run build                # Production build
npm run start                # Serve the production build
npm run lint                 # ESLint
npm run test                 # 214 Vitest tests
npm run test:watch           # Vitest in watch mode
node scripts/copy-config.js  # Copy contract config manually
```

---

## 14.0 Production notes

The project targets a local demonstration chain, but if deployed further:

- **Never commit `.env.local`.** It is git-ignored; keep it that way.
- **Move `ENCRYPTION_KEY` and `ADMIN_PRIVATE_KEY` into a managed secret store** (AWS Secrets Manager, HashiCorp Vault, or a KMS) rather than environment variables.
- **Back up `ENCRYPTION_KEY` independently of the database.** Losing it destroys access to every artifact; losing both leaves nothing recoverable.
- **Set `PINATA_API_KEY` / `PINATA_SECRET_KEY`.** All three issuance paths refuse mock CIDs in production, so issuance will return 503 without them.
- **Set `SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL`**, or e-mail-dependent routes will return 503.
- **Set `NEXT_PUBLIC_BLOCK_EXPLORER_URL`** once on a chain that has an explorer.
- **Reconsider single-confirmation finality.** `tx.wait()` returning is treated as settled, which holds on Hardhat and does not on a public chain.
