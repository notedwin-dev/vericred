# VeriCred — Smart Contract (Hardhat)

Blockchain-anchored academic credential registry.
Module: **CT124-3-3-BCD** Blockchain Design and Development — Group 14, APU.

This package contains the **Solidity / Hardhat** half of the VeriCred DApp.
The Next.js frontend connects to the contract deployed by `scripts/deploy.js`.

---

## 1. Requirements

| Tool | Version |
|---|---|
| Node.js | 18 LTS or newer |
| npm | 9 or newer |
| Visual Studio Code | any recent |

---

## 2. Setup

```bash
npm install
```

Hardhat downloads the Solidity 0.8.24 compiler automatically on first build,
so an internet connection is needed once.

---

## 3. Compile

```bash
npx hardhat compile
```

Expected output:

```
Compiled 1 Solidity file successfully (evm target: paris).
```

Artifacts (ABI + bytecode) are written to `artifacts/`.

---

## 4. Run the tests

```bash
npx hardhat test
```

37 tests cover deployment, access control, issuing, batch issuing,
verification, revocation, tamper detection and pagination.

---

## 5. Deploy to the local blockchain

Two terminals are needed.

**Terminal 1 — start the local chain (leave running):**

```bash
npx hardhat node
```

This starts a blockchain at `http://127.0.0.1:8545`, chainId `31337`,
with 20 pre-funded test accounts.

**Terminal 2 — deploy, then load demo data:**

```bash
npx hardhat run scripts/deploy.js --network localhost
npx hardhat run scripts/seed.js  --network localhost
```

`deploy.js` writes two files into `frontend-config/`:

| File | Purpose |
|---|---|
| `contract.json` | Deployed address, chainId and ABI |
| `.env.local` | Copy into the Next.js project root |

Copy `frontend-config/.env.local` into your Next.js folder so the frontend
knows where the contract lives.

---

## 6. Accounts used by the demo

Hardhat's node always generates the same accounts, so these are stable:

| Role | Address | Notes |
|---|---|---|
| Admin | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | Account #0, deployer |
| Academic Registry | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | Account #1, issues credentials |
| Employer / verifier | any address, or none | Verification is a free read |

---

## 7. System features

### Roles

- **Admin** — authorises and removes institutions, can transfer admin rights.
- **Institution (Academic Registry)** — issues credentials, revokes its own.
- **Verifier (employer, public)** — verifies any credential for free, no account
  and no wallet balance required.

### Contract functions

| Function | Access | Purpose |
|---|---|---|
| `issueCredential(id, cid)` | Institution | Anchors one credential |
| `issueCredentialBatch(ids[], cids[])` | Institution | Anchors a whole cohort in one transaction |
| `revokeCredential(id, reason)` | Issuer or admin | Withdraws a credential, reason is published |
| `verifyCredential(id)` | Anyone (free) | Returns `exists`, `valid`, `cid`, `issuer`, `issuedAt` |
| `getCredential(id)` | Anyone (free) | Full record including revocation detail |
| `isValid(id)` | Anyone (free) | Single boolean for a UI badge |
| `getCredentialsPaged(offset, limit)` | Anyone (free) | Paginated listing for the registry table |
| `totalCredentials()` | Anyone (free) | Record count |
| `authoriseInstitution(addr)` | Admin | Grants issuing rights |
| `removeInstitution(addr)` | Admin | Revokes issuing rights (past credentials stay valid) |
| `transferAdmin(addr)` | Admin | Hands over administration |

### Events

| Event | Emitted when |
|---|---|
| `CredentialIssued` | A credential is anchored |
| `CredentialRevoked` | A credential is withdrawn |
| `InstitutionAuthorised` | An institution gains issuing rights |
| `InstitutionRemoved` | An institution loses issuing rights |
| `AdminTransferred` | Administration changes hands |

---

## 8. Design decisions

**No personal data is stored on-chain.**
Only the IPFS CID of the encrypted certificate file is written to the
blockchain. Names, student IDs and programme details stay in the off-chain
MySQL index. A public ledger is permanent and world-readable, so personal
data must never be placed in it.

**The CID is the integrity fingerprint.**
An IPFS CID is a multihash of the file's own bytes. Change one character of
the certificate and it hashes to a different CID, which no longer matches
what was anchored. No separate hash field is needed, and none is stored.

**`exists` and `valid` are returned separately.**
A forged certificate (never anchored) and a genuine but withdrawn one are
different situations. An employer needs to tell them apart, so
`verifyCredential` reports both facts rather than collapsing them into one
boolean.

**An anchored CID can never be overwritten.**
There is no setter, and re-issuing an existing identifier reverts. If the
registry could swap the file behind an identifier an employer had already
verified, anchoring it would be pointless.

**Revocation appends, it never deletes.**
Revoking sets a status flag and records a reason. The struct, the CID and the
original `CredentialIssued` event all survive untouched, so the full history
of the award stays auditable forever.

**Removing an institution does not void its past credentials.**
Losing the right to issue in future is not the same as previous awards
becoming void, and the contract does not conflate the two.

**Storage is packed.**
`issuer` (20 bytes) + `issuedAt` (5) + `revokedAt` (5) + `revoked` (1) equals
31 bytes, so these four fields share a single 32-byte storage slot. `uint40`
timestamps remain valid until the year 36812.

---

## 9. Measured gas costs

Taken from a live Hardhat node, optimizer enabled at 200 runs.

| Operation | Gas |
|---|---|
| Deploy (constructor) | 1,556,067 |
| `authoriseInstitution` | 47,686 |
| `issueCredential` | 189,621 |
| `revokeCredential` | 57,159 |
| `issueCredentialBatch` (50 records) | 144,848 per credential |
| `verifyCredential` | 0 — read-only call |

Batching a 50-graduate cohort saves **23.6%** against issuing one at a time,
because the ~21,000 gas transaction base cost is paid once rather than fifty
times.

Verification costs nothing, which is the point: an employer anywhere in the
world can check a degree without an account, a wallet balance, or a request
to the university.

---

## 10. Project structure

```
.
├── contracts/
│   └── VeriCred.sol           the smart contract
├── scripts/
│   ├── deploy.js              deploys and exports address + ABI
│   └── seed.js                loads four demo credentials
├── test/
│   └── VeriCred.test.js       37 tests
├── hardhat.config.js
├── package.json
└── README.md
```

Generated at build time and not included here:
`node_modules/`, `artifacts/`, `cache/`, `frontend-config/`.
