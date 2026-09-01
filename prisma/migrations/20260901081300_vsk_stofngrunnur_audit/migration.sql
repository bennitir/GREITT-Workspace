-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "vatCode" TEXT,
ADD COLUMN     "vatDeductiblePercent" INTEGER,
ADD COLUMN     "vatTreatment" TEXT;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "vatConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "vatConfirmedBy" TEXT,
ADD COLUMN     "vatDataSource" TEXT,
ADD COLUMN     "vatDataUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "vatRegistered" BOOLEAN,
ADD COLUMN     "vatRegistrationDate" TIMESTAMP(3),
ADD COLUMN     "vatSettlementType" TEXT;

-- AlterTable
ALTER TABLE "VatPeriod" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedBy" TEXT,
ADD COLUMN     "dataSource" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "periodEnd" TIMESTAMP(3),
ADD COLUMN     "periodStart" TIMESTAMP(3),
ADD COLUMN     "periodType" TEXT;

-- AlterTable
ALTER TABLE "VatSubmission" ADD COLUMN     "calculatedAt" TIMESTAMP(3),
ADD COLUMN     "calculationSource" TEXT,
ADD COLUMN     "correctionReason" TEXT;

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "parentEntityType" TEXT,
    "parentEntityId" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'SYSTEM',
    "description" TEXT,
    "beforeData" JSONB,
    "afterData" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEvent_companyId_createdAt_idx" ON "AuditEvent"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_companyId_entityType_entityId_idx" ON "AuditEvent"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_parentEntityType_parentEntityId_idx" ON "AuditEvent"("parentEntityType", "parentEntityId");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_idx" ON "AuditEvent"("userId");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- CreateIndex
CREATE INDEX "Account_companyId_isActive_idx" ON "Account"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "AiBookingEntry_receiptId_idx" ON "AiBookingEntry"("receiptId");

-- CreateIndex
CREATE INDEX "AiDetectedDocument_receiptId_idx" ON "AiDetectedDocument"("receiptId");

-- CreateIndex
CREATE INDEX "AiDetectedDocument_voucherNumber_idx" ON "AiDetectedDocument"("voucherNumber");

-- CreateIndex
CREATE INDEX "AiDetectedDocumentEntry_documentId_idx" ON "AiDetectedDocumentEntry"("documentId");

-- CreateIndex
CREATE INDEX "AiUsage_companyId_idx" ON "AiUsage"("companyId");

-- CreateIndex
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

-- CreateIndex
CREATE INDEX "BankAccount_companyId_idx" ON "BankAccount"("companyId");

-- CreateIndex
CREATE INDEX "BankTransaction_bankAccountId_date_idx" ON "BankTransaction"("bankAccountId", "date");

-- CreateIndex
CREATE INDEX "BankTransaction_bankAccountId_status_idx" ON "BankTransaction"("bankAccountId", "status");

-- CreateIndex
CREATE INDEX "ImportBatch_companyId_idx" ON "ImportBatch"("companyId");

-- CreateIndex
CREATE INDEX "ImportBatch_bankAccountId_idx" ON "ImportBatch"("bankAccountId");

-- CreateIndex
CREATE INDEX "Receipt_companyId_idx" ON "Receipt"("companyId");

-- CreateIndex
CREATE INDEX "Receipt_companyId_status_idx" ON "Receipt"("companyId", "status");

-- CreateIndex
CREATE INDEX "Receipt_companyId_voucherNumber_idx" ON "Receipt"("companyId", "voucherNumber");

-- CreateIndex
CREATE INDEX "ReceiptEntry_receiptId_idx" ON "ReceiptEntry"("receiptId");

-- CreateIndex
CREATE INDEX "VatPeriod_companyId_status_idx" ON "VatPeriod"("companyId", "status");

-- CreateIndex
CREATE INDEX "VatPeriod_companyId_dueDate_idx" ON "VatPeriod"("companyId", "dueDate");

-- CreateIndex
CREATE INDEX "VatSubmission_vatPeriodId_status_idx" ON "VatSubmission"("vatPeriodId", "status");

-- CreateIndex
CREATE INDEX "VatSubmission_submittedAt_idx" ON "VatSubmission"("submittedAt");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
