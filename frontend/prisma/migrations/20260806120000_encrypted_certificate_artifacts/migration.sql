-- AlterTable: encrypted certificate artifacts + the private award grade.
-- All nullable with no default, so this is additive and existing rows keep
-- working: encKeyEnc IS NULL marks a row whose `cid` points at a plaintext
-- PDF pinned before encryption existed. Those are deliberately not backfilled
-- (re-encrypting changes the CID, which is already anchored immutably on-chain).
ALTER TABLE "Certificate" ADD COLUMN "encKeyEnc" TEXT,
ADD COLUMN "contentHash" TEXT,
ADD COLUMN "computedCid" TEXT,
ADD COLUMN "grade" TEXT;

-- CreateTable
CREATE TABLE "CertificateShare" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificateShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CertificateShare_token_key" ON "CertificateShare"("token");

-- CreateIndex
CREATE INDEX "CertificateShare_certificateId_idx" ON "CertificateShare"("certificateId");

-- AddForeignKey
ALTER TABLE "CertificateShare" ADD CONSTRAINT "CertificateShare_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
