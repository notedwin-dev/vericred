# VeriCred — Product Requirements Document

## Overview

VeriCred is a blockchain-based Academic Credential Verification System similar to Accredible and Credly. It anchors IPFS CIDs of encrypted certificate PDFs on-chain, providing tamper-proof, instantly verifiable academic credentials.

**Module:** CT124-3-3-BCD (Blockchain Design and Development)
**Team:** Group 14, APU
**License:** MIT

---

## Problem Statement

Universities issue degrees and certificates. Employers who want to verify a certificate must email the university and wait, or trust a PDF that anyone can forge. Fake degrees are a real, expensive problem. If a university's database is compromised or a staff member is bribed, records can be silently altered. There is no cheap, tamper-proof way to verify a credential.

## Solution

Instead of storing certificates on-chain, the university stores a fingerprint (IPFS CID — a content-addressed hash) of the encrypted certificate file. Once anchored on the blockchain, nobody can alter or delete it, not even the university. Anyone can verify a certificate against the stored fingerprint to prove it is genuine and untouched.

---

## User Roles

### 1. Verifier (Public / Employer)
Anyone worldwide. No account or wallet required for basic verification.
- Verify a credential by ID or QR code scan
- View credential details (issuer, date, status, blockchain proof)
- Distinguish "never issued" from "issued then revoked" from "expired"

### 2. Recipient (Student / Professional)
Authenticated users who hold credentials.
- Sign up via WalletConnect, OAuth (GitHub/Google/LinkedIn), or email/password
- View all credentials on their dashboard
- Download certificate PDFs
- Share credentials on LinkedIn
- Link/migrate wallet address (all credentials transfer on-chain)
- Claim credentials via issuer-provided collection links

### 3. Issuer (University / Event Organizer / Organization)
Authenticated users with issuer privileges.
- Create certificate templates (simple text-based layout)
- Create courses linked to templates
- Issue single or batch certificates (multi-row form or CSV upload)
- Generated certificates: PDF with QR code → uploaded to IPFS → CID anchored on-chain
- Generate collection links (shareable URLs for recipients to claim certificates)
  - Set max number of collections
  - Set link expiry (when the link stops working)
  - Set certificate expiry (when the credential expires)
- Revoke own certificates with mandatory reason

### 4. Admin
Platform administrator with on-chain authority.
- Authorize/remove institution wallet addresses on-chain
- Revoke any credential (override authority)
- Transfer admin role
- View all credentials and institutions

---

## Features

### F1: Landing Page
- No navigation bar
- Hero section explaining VeriCred
- "Verify a Credential" CTA button
- "Sign In" button (top right corner)
- "How It Works" section

### F2: Authentication
- **Primary:** Login with WalletConnect (SIWE — Sign-In with Ethereum)
- **OAuth:** Continue with GitHub / Google / LinkedIn
- **Email/Password:** For users who don't have a wallet yet
  - System generates a custody wallet address on signup
  - Wallet can be linked later via WalletConnect (triggers on-chain credential transfer)
- Auth.js v5 with Prisma adapter

### F3: Credential Verification (Public)
- Enter credential ID or scan QR code
- Results: Valid (green) / Revoked (amber) / Expired (gray) / Not Found (red)
- Shows: issuer, issued date, recipient, CID, expiry
- Blockchain transparency: IPFS gateway link, transaction hash, block number

### F4: Public Credential Page (`/c/[credentialId]`)
- Shareable Accredible-style credential page
- Shows credential details, issuer logo, verification status
- QR code linking to verification
- "Add to LinkedIn Profile" button
- IPFS and blockchain explorer links

### F5: Certificate Templates
- Simple text-based configuration
- Fields: title, subtitle, body text, issuer name, logo, accent color
- One template linked to one or more courses

### F6: Course Management (Issuer)
- Create courses with name, description, linked template
- View certificates issued per course
- Issue certificates from course detail page

### F7: Certificate Issuance
- **Single:** Form with recipient name, email, wallet address
- **Batch:** Multi-row dynamic form OR CSV file upload with preview
- Flow: Generate PDF (with QR code) → Upload to IPFS (Pinata) → Anchor CID on-chain → Store metadata in PostgreSQL
- Each certificate gets a unique credential ID (e.g., "VC-2026-0001")

### F8: Collection Links
- Issuer generates a shareable link for a course
- Settings: max collections (or unlimited), link expiry, certificate expiry
- Recipients visit the link, sign in, and claim the certificate
- System generates a personalized certificate with their name, anchors it on-chain

### F9: User Dashboard
- Grid/list of all credentials
- Per-credential actions: View details, Download PDF, Share to LinkedIn, View on blockchain
- Profile settings: link wallet via WalletConnect

### F10: Issuer Dashboard
- Stats: total issued, active, revoked
- Course management, template management
- Collection link management

### F11: Admin Panel
- Authorize/remove institution wallet addresses (on-chain transactions)
- Institution list (built from on-chain event scan)
- View all credentials with revoke capability
- Transfer admin role

### F12: PDF Certificate Generation
- Server-side using @react-pdf/renderer
- Template-based with customizable fields
- Embedded QR code linking to `/verify/[credentialId]`
- Uploaded to IPFS, CID anchored on-chain

### F13: Blockchain Transparency
- Every credential shows: IPFS CID (copyable + gateway link), transaction hash (+ explorer link), smart contract address, block number and timestamp
- Demonstrates that the credential is genuinely on-chain and the PDF is on IPFS

### F14: Wallet Linking & Credential Transfer
- Email/password users get a custody wallet on signup
- "Link Wallet" in settings opens WalletConnect
- On linking: all existing credentials transferred on-chain to the new wallet via `transferCredential`

### F15: LinkedIn Integration
- "Add to LinkedIn Profile" button on credential pages
- Pre-fills LinkedIn's certification section with credential details

---

## Smart Contract Interface

### On-Chain Data (VeriCred.sol)

```solidity
struct Credential {
    address issuer;
    address recipient;        // credential holder's wallet
    uint40  issuedAt;
    uint40  revokedAt;
    uint40  expiresAt;        // 0 = no expiry
    bool    revoked;
    string  cid;              // IPFS CID of encrypted certificate
    string  credentialId;     // e.g. "VC-2026-0001"
    string  revocationReason;
}
```

### Contract Functions

| Function | Access | Purpose |
|---|---|---|
| `issueCredential(id, cid, recipient, expiresAt)` | Institution | Anchor single credential |
| `issueCredentialBatch(ids[], cids[], recipients[], expiresAts[])` | Institution | Anchor batch |
| `revokeCredential(id, reason)` | Issuer or Admin | Revoke with reason |
| `transferCredential(id, newRecipient)` | Recipient or Admin | Wallet migration |
| `verifyCredential(id)` | Anyone (free) | Returns exists, valid, cid, issuer, issuedAt, recipient, expiresAt |
| `getCredential(id)` | Anyone (free) | Full record |
| `isValid(id)` | Anyone (free) | Boolean check (includes expiry) |
| `getCredentialsPaged(offset, limit)` | Anyone (free) | Paginated browse |
| `getCredentialsByRecipient(addr, offset, limit)` | Anyone (free) | Credentials by wallet |
| `authoriseInstitution(addr)` | Admin | Grant issuing rights |
| `removeInstitution(addr)` | Admin | Revoke issuing rights |
| `transferAdmin(addr)` | Admin | Transfer admin role |

### Off-Chain Data (PostgreSQL)

All personal information stays in the database:
- User profiles (name, email, avatar)
- Course details (name, description)
- Certificate templates (layout config)
- Collection links (token, limits, expiry)
- Certificate metadata (recipient name, course association)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4, shadcn/ui, lucide-react |
| Auth | Auth.js v5 (NextAuth), WalletConnect, SIWE, bcrypt |
| Database | PostgreSQL, Prisma ORM |
| Blockchain | Solidity ^0.8.24, Hardhat, ethers.js v6 |
| PDF | @react-pdf/renderer |
| IPFS | Pinata SDK |
| QR Codes | qrcode |
| Dark Mode | next-themes |
| Toasts | sonner |

---

## Demo Flow

1. **Issue**: University signs in → creates template → creates course → issues certificates (single or batch) → PDFs generated with QR codes → uploaded to IPFS → CIDs anchored on blockchain
2. **Verify (valid)**: Employer visits verify page → enters credential ID → sees "Valid" with issuer, date, IPFS link, blockchain proof
3. **Tamper detection**: Change one detail in the certificate file → re-verify → CID mismatch → "Invalid/Tampered"
4. **Revoke**: University revokes a credential with reason → verify again → shows "Revoked" with reason
5. **Collection**: Issuer generates link → student clicks link → signs in → claims certificate → appears in dashboard
6. **Blockchain proof**: View IPFS hash, click through to see the immutable file. View transaction hash on blockchain.
