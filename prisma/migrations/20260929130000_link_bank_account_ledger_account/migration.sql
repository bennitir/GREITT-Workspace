-- AlterTable
ALTER TABLE "BankAccount" ADD COLUMN "ledgerAccountId" INTEGER;

-- CreateIndex
CREATE INDEX "BankAccount_ledgerAccountId_idx" ON "BankAccount"("ledgerAccountId");

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
