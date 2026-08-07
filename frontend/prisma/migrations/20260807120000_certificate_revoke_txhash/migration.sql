-- Transaction hash of the on-chain revokeCredential call (see lib/revoke.ts).
-- NULL means the revocation exists off-chain only.
ALTER TABLE "Certificate" ADD COLUMN "revokeTxHash" TEXT;
