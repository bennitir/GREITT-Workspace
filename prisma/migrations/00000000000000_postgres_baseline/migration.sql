-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Company" (
    "nextVoucherNumber" INTEGER NOT NULL DEFAULT 1,
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kennitala" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "vatNumber" TEXT,
    "receiptEntryMode" TEXT NOT NULL DEFAULT 'AI',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rskRegisteredActivities" TEXT,
    "activeActivities" TEXT,
    "rskCertificatePath" TEXT,
    "rskDataUpdatedAt" TIMESTAMP(3),
    "activitiesConfirmedAt" TIMESTAMP(3),
    "activitiesConfirmedBy" TEXT,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "kennitala" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "fileName" TEXT,
    "filePath" TEXT,
    "fileHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "receiptNumber" TEXT,
    "voucherNumber" INTEGER,
    "merchantName" TEXT,
    "merchantKennitala" TEXT,
    "ocrText" TEXT,
    "ocrConfidence" DOUBLE PRECISION,
    "ocrStatus" TEXT,
    "aiDate" TIMESTAMP(3),
    "aiAmount" DOUBLE PRECISION,
    "aiApprovedAt" TIMESTAMP(3),
    "documentCount" INTEGER,
    "suggestedDebitAccount" TEXT,
    "suggestedCreditAccount" TEXT,
    "suggestedBookingText" TEXT,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "storagePath" TEXT,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptEntry" (
    "id" SERIAL NOT NULL,
    "account" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receiptId" INTEGER NOT NULL,

    CONSTRAINT "ReceiptEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiBookingEntry" (
    "id" SERIAL NOT NULL,
    "account" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receiptId" INTEGER NOT NULL,

    CONSTRAINT "AiBookingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiDetectedDocument" (
    "id" SERIAL NOT NULL,
    "merchantName" TEXT,
    "date" TIMESTAMP(3),
    "receiptNumber" TEXT,
    "totalAmount" DOUBLE PRECISION,
    "summary" TEXT NOT NULL,
    "receiptId" INTEGER NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "voucherNumber" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "pageNumber" INTEGER,
    "duplicateMarkedAt" TIMESTAMP(3),
    "duplicateOfDocumentId" INTEGER,
    "duplicateVoucherNumber" INTEGER,
    "merchantKennitala" TEXT,

    CONSTRAINT "AiDetectedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiDetectedDocumentEntry" (
    "id" SERIAL NOT NULL,
    "account" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "documentId" INTEGER NOT NULL,

    CONSTRAINT "AiDetectedDocumentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "entryRole" TEXT NOT NULL DEFAULT 'GENERAL',
    "vatRate" INTEGER,
    "vatAccount" TEXT,
    "vatRequiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'CLIENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCompany" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "accessRole" TEXT NOT NULL DEFAULT 'MANAGER',

    CONSTRAINT "UserCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER,
    "userId" INTEGER,
    "receiptId" INTEGER,
    "action" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costIsk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usdIskRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyModule" (
    "id" SERIAL NOT NULL,
    "moduleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherNumberReservation" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "voucherNumber" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VoucherNumberReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'CSV',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" SERIAL NOT NULL,
    "importBatchId" INTEGER NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "voucherNumber" INTEGER,
    "date" TIMESTAMP(3),
    "account" TEXT,
    "text" TEXT,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "errorMessage" TEXT,
    "rawData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitCostIsk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCostIsk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_kennitala_key" ON "Company"("kennitala");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_kennitala_key" ON "Customer"("kennitala");

-- CreateIndex
CREATE UNIQUE INDEX "Account_companyId_number_key" ON "Account"("companyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserCompany_userId_companyId_key" ON "UserCompany"("userId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "CompanyModule_companyId_idx" ON "CompanyModule"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyModule_companyId_moduleId_key" ON "CompanyModule"("companyId", "moduleId");

-- CreateIndex
CREATE INDEX "VoucherNumberReservation_companyId_idx" ON "VoucherNumberReservation"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherNumberReservation_companyId_voucherNumber_key" ON "VoucherNumberReservation"("companyId", "voucherNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_importBatchId_rowNumber_key" ON "ImportRow"("importBatchId", "rowNumber");

-- CreateIndex
CREATE INDEX "UsageEvent_companyId_idx" ON "UsageEvent"("companyId");

-- CreateIndex
CREATE INDEX "UsageEvent_createdAt_idx" ON "UsageEvent"("createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_eventType_idx" ON "UsageEvent"("eventType");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptEntry" ADD CONSTRAINT "ReceiptEntry_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBookingEntry" ADD CONSTRAINT "AiBookingEntry_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiDetectedDocument" ADD CONSTRAINT "AiDetectedDocument_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiDetectedDocumentEntry" ADD CONSTRAINT "AiDetectedDocumentEntry_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AiDetectedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCompany" ADD CONSTRAINT "UserCompany_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyModule" ADD CONSTRAINT "CompanyModule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
