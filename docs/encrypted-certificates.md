# Encrypted certificate artifacts — design record

Status: implemented
Supersedes: nothing. Closes a gap between `PRD.md` / the Part 1 proposal and the code.

## What shipped

| Area | Files |
|---|---|
| Binary AES-256-GCM (`VCE1` artifacts) | `lib/crypto.ts` |
| Render/pin split, encryption at issuance | `lib/generate-certificate.tsx` |
| Local CIDv1 recomputation (best-effort) | `lib/cid.ts` |
| Integrity check over retrieved bytes | `lib/integrity.ts`, `api/verify/[credentialId]/integrity` |
| Public PNG preview (no grade) | `lib/certificate-image.tsx`, `api/verify/[credentialId]/preview` |
| Decryption for entitled readers | `lib/certificate-document.ts`, `api/certificates/[id]/document` |
| Revocable sharing | `lib/certificate-share.ts`, `api/certificates/[id]/share`, `api/share/[token]/document`, `/s/[token]`, `components/dashboard/share-certificate-dialog.tsx` |
| Key never leaves the server | `lib/prisma.ts` global `omit` |
| Schema | `prisma/migrations/20260806120000_encrypted_certificate_artifacts` |

214 tests pass. Two of them are worth knowing about because the obvious version
of each is **vacuous**, and both were caught by checking rather than assuming:

- `@react-pdf` Flate-compresses content streams, so `pdf.includes("First Class
  Honours")` is false even for an *unencrypted* PDF. Asserting the grade is
  absent from the pinned bytes would therefore pass with encryption removed.
  The real assertions are that the artifact is not parseable as a document and
  that the grade changes the rendered PDF.
- PNG is compressed too, so the preview is proven grade-free by rendering the
  same certificate with and without a grade and comparing bytes.

## The gap this closes

The Part 1 proposal states in five places that certificate PDFs are encrypted before
being pinned to IPFS:

| Where | Claim |
|---|---|
| §4.3 | personal data must not be published "in a permanent, public, and irreversible way" |
| §5.2 | "The certificate file is encrypted and stored on IPFS… only authorized key-holders can read the file" |
| §5.4 | "encrypts the certificate and uploads it to IPFS… The graduate is issued… the key to unwrap the certificate" |
| §5.4 | "after it is decrypted with the key of the file's owner" |
| §6.2 | the hybrid-storage privacy argument |
| §7 | "storing encrypted certificates on IPFS" |

None of it was implemented. `lib/generate-certificate.tsx` rendered the PDF and handed
the raw buffer to Pinata; `lib/crypto.ts` existed but was imported only by
`lib/operator-wallet.ts`, for wallet private keys. No certificate was encrypted, no key
was issued, nothing was ever decrypted.

## Two findings that shaped the design

**1. Encrypting alone would have protected nothing.**

The PDF renders recipientName, courseName, issuerName, issuedAt, credentialId and a QR
code. `GET /api/verify/[credentialId]` is unauthenticated and already returns
recipientName, course name, issuer name, status, dates, revocation reason and the CID
for any credential ID. The PDF therefore contained **no field that was not already
public**.

So encryption on its own would have closed exactly one vector — "anyone who ever sees
the CID can pull the file from a public gateway forever, including for revoked
credentials" — while leaving §6.2's privacy claim as false as before. That vector is
real and is precisely what §4.3 describes, but it is narrower than what was promised.

The fix is therefore *two* changes, not one: encrypt the artifact **and** give it
content the public API does not return. `grade` (classification) is that content, named
in the proposal's own §4.1 as award data.

**2. Nothing ever verified a CID.**

The CID was a string passed Pinata → Postgres → chain → page. No `multiformats`
dependency existed; the bytes were never re-hashed after `renderToBuffer`. Worse,
`api/verify/[credentialId]/route.ts` let the chain CID silently overwrite the DB one
without comparing them, so a tampered DB row still rendered "Valid Credential".

`contracts/VeriCred.sol:362` already documents the intended behaviour — *"the caller
recomputes the CID of the file they were given and compares it with this value"*. The
contract was right; the frontend never did it. Encryption is the natural moment to fix
this, because verification is the one operation that does **not** need the key.

## Decisions

### D1 — The public page shows a re-render, not the pinned file

`certificate-preview.tsx` built `https://ipfs.io/ipfs/<cid>` in the browser and dropped
it in an `<iframe>`. Ciphertext cannot be rendered that way, so encryption forces this
component to change.

**Decision:** the public credential page keeps its Credly-style certificate image, but
the server regenerates it from Postgres as a **PNG**, served by
`GET /api/verify/[credentialId]/preview` — **with `grade` omitted**. The pinned artifact
stays encrypted and is never handed to the public unkeyed.

The public artifact and the encrypted artifact are deliberately *different documents*.
That is what makes the hybrid-storage claim literally true rather than rhetorical.

**Why a PNG rather than re-serving a PDF.** An earlier draft of this design kept the PDF
and rejected rasterising as "a heavy dependency for marginal gain" — that assumed
`pdfjs` plus `node-canvas`. It is neither heavy nor a new dependency using
`ImageResponse` from `next/og`, which ships with Next 15. Three things make the image
the better artifact:

- **Mobile.** The comment this component carried since it was written admitted that some
  mobile browsers force a download rather than rendering a PDF inline. An image removes
  that class of problem outright.
- **`og:image`.** `PRD.md` lists LinkedIn sharing as a Recipient feature and
  `/c/[credentialId]` has the button, but no social platform will accept a PDF as a
  preview image. A PNG makes the share card show the certificate.
- **Caching.** A plain `<img>` with an `ETag` beats an `<iframe>` holding a PDF plugin.

Two consequences are accepted rather than solved:

1. **Two renderers for one design.** `certificate-pdf.tsx` (`@react-pdf/renderer`,
   Helvetica) draws the authoritative encrypted PDF; `certificate-image.tsx` (satori,
   Geist) draws the public PNG. Both read the same `CertificateTemplateLayout` and the
   same fields, so wording, colour and structure stay in step, but glyph metrics differ.
   They are already different documents by design, so this is a visible-but-acceptable
   trade-off, not a defect. Unifying them would require a second font pipeline for
   `@react-pdf`, which accepts only TTF/OTF.
2. **A font must be shipped.** satori cannot resolve `"Helvetica"` by name and rejects
   woff2, which is the only format `next/font/google` leaves on disk. `@fontsource/geist-sans`
   supplies plain `.woff` and matches the site's typeface.

**Rejected:** rendering the preview only for key-holders. It is the strongest privacy
position but abandons the Accredible/Credly-style presentation the product is built
around, for a credential the holder generally *wants* seen.

### D2 — Verification re-hashes bytes, and never needs the key

Proving a certificate is untampered is: fetch the artifact by the **chain's** CID →
hash the bytes → compare. That is a hash over *ciphertext*. A verifier with no key can
still prove authenticity, so encryption costs public verifiability nothing.

Two mechanisms, the reliable one load-bearing:

- **`contentHash` (sha256 of the pinned bytes) is the default check.** Deterministic,
  identical in dev/test/production, cannot mismatch. It is cryptographically meaningful
  *because the retrieval key comes from the chain*: an attacker who alters the artifact
  changes its CID and so cannot serve it under the anchored one.
- **`computedCid` (locally recomputed CIDv1) is best-effort.** Stronger when it works,
  because the bytes re-derive the value anchored on-chain — closing even the
  dishonest-gateway case.

**Why not rely on `computedCid` alone:** reproducing Pinata's CIDv1 requires matching its
UnixFS parameters (chunker, layout, `rawLeaves`, directory wrapping), and Pinata does not
document them. Neither dev nor CI can discover the answer, because `lib/ipfs.ts` takes
the mock-CID branch without credentials. An assertion on it would be a
production-only tripwire — every issuance failing the moment real credentials are
configured, discovered live. So `computeCidV1` returns `null` rather than throwing, a
mismatch is logged and persisted rather than fatal, and hard failure sits behind
`IPFS_REQUIRE_CID_MATCH` (default off) to be enabled only after calibration observes
agreement.

**Known limitation, to be stated in the write-up rather than glossed:** the
`computedCid === cid` path is untested by CI and can only be validated against a real
Pinata pin.

### D3 — Key custody is server-side, and this deviates from the proposal

**Decision:** a random 32-byte content key per certificate, wrapped with `ENCRYPTION_KEY`
and stored on the row — the same at-rest pattern as `Issuer.operatorKeyEnc` in
`lib/operator-wallet.ts`. The holder downloads while signed in; the server decrypts.

The proposal (§5.4) says "the graduate is issued… the key to unwrap the certificate",
i.e. the holder holds the key. **That is not what is being built, and the report must say
so.** The literal design — the raw key in a URL fragment, decrypted in the browser —
makes revocation impossible and leaks the key into browser history and any forwarded
link.

The chosen design is stronger on the property that matters: because the key never leaves
the server, sharing a certificate is a *database grant* rather than a key hand-off, so
revoking a share genuinely revokes access. Deviating and explaining is the honest
position; claiming the literal design was implemented would replace one contradiction
with another.

### D4 — Legacy rows are not backfilled

`encKeyEnc == null` means the row predates this feature and its `cid` points at a
plaintext PDF. Certificates already anchored keep working: the preview is unaffected
(it renders from Postgres), download re-renders from Postgres, and the integrity check
reports `unavailable / legacy` — **never** `mismatch`.

Re-encrypting a legacy certificate would produce a new CID that disagrees with the one
already anchored immutably on-chain. The old plaintext CID is the historically correct
anchor for what was actually issued.

## Consequences

- The pinned file is no longer a document. It is named `.vcenc`, not `.pdf`, and the
  public page links to it as "encrypted source on IPFS" rather than pretending
  otherwise — worth demonstrating, not hiding.
- `ENCRYPTION_KEY` becomes required for **all** certificate issuance, not just operator
  wallet provisioning. `.env.example` and `.env.test` both need it.
- The holder-download path cannot work end-to-end in local development without real
  Pinata credentials, because the mock CID resolves to nothing. It returns an honest 502
  rather than silently falling back to a re-render, which would mask genuine retrieval
  failures in production.
- `encKeyEnc` must never reach a response body. A global Prisma `omit` in
  `lib/prisma.ts` closes all eight current call sites and any future one; the single
  query that needs the key opts back in explicitly.

## Not doing

- **Encrypting the metadata in Postgres.** Out of scope, and §6.2 explicitly places
  readable metadata in the institution's own database by design.
- **Client-side decryption.** See D3.
- **Backfilling existing certificates.** See D4.
