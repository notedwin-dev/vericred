-- AlterTable
ALTER TABLE "Issuer" ADD COLUMN     "operatorAddress" TEXT,
ADD COLUMN     "operatorKeyEnc" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX CONCURRENTLY "Issuer_operatorAddress_key" ON "Issuer"("operatorAddress");
