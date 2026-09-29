-- CreateTable
CREATE TABLE "FinancialReconciliation" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "reconciliationType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "confidence" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'SYSTEM',
    "confirmedByUserId" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialReconciliationParticipant" (
    "id" SERIAL NOT NULL,
    "reconciliationId" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "matchedAmount" DECIMAL(65,30) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialReconciliationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialReconciliation_companyId_status_idx" ON "FinancialReconciliation"("companyId", "status");

-- CreateIndex
CREATE INDEX "FinancialReconciliation_companyId_reconciliationType_idx" ON "FinancialReconciliation"("companyId", "reconciliationType");

-- CreateIndex
CREATE INDEX "FinancialReconciliation_confirmedByUserId_idx" ON "FinancialReconciliation"("confirmedByUserId");

-- CreateIndex
CREATE INDEX "FinancialReconciliationParticipant_sourceType_sourceKey_idx" ON "FinancialReconciliationParticipant"("sourceType", "sourceKey");

-- CreateIndex
CREATE INDEX "FinancialReconciliationParticipant_reconciliationId_role_idx" ON "FinancialReconciliationParticipant"("reconciliationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialReconciliationParticipant_reconciliationId_sourceT_key" ON "FinancialReconciliationParticipant"("reconciliationId", "sourceType", "sourceKey", "role");

-- AddForeignKey
ALTER TABLE "FinancialReconciliation" ADD CONSTRAINT "FinancialReconciliation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialReconciliation" ADD CONSTRAINT "FinancialReconciliation_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialReconciliationParticipant" ADD CONSTRAINT "FinancialReconciliationParticipant_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "FinancialReconciliation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
