-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "fingerprint" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_bankAccountId_fingerprint_key" ON "BankTransaction"("bankAccountId", "fingerprint");
