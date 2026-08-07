-- CreateEnum
CREATE TYPE "IssuerStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Issuer" ADD COLUMN     "status" "IssuerStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "rejectionReason" TEXT;

-- Backfill: rows created before self-service registration existed (e.g. via
-- prisma/seed.ts) were never subject to the approval gate and are already
-- trusted/functioning issuers -- treat them as already approved rather than
-- retroactively blocking them.
UPDATE "Issuer" SET "status" = 'APPROVED';

-- CreateIndex
CREATE UNIQUE INDEX "Issuer_walletAddress_key" ON "Issuer"("walletAddress");
