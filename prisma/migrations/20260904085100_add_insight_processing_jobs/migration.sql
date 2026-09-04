-- CreateTable
CREATE TABLE "InsightProcessingJob" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "processingVersion" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SYSTEM',
    "requestedById" INTEGER,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "pendingItems" INTEGER NOT NULL DEFAULT 0,
    "processingItems" INTEGER NOT NULL DEFAULT 0,
    "completedItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsightProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightProcessingItem" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "receiptId" INTEGER NOT NULL,
    "documentId" INTEGER,
    "itemKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "processingVersion" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "resultMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsightProcessingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsightProcessingJob_companyId_status_idx"
ON "InsightProcessingJob"("companyId", "status");

-- CreateIndex
CREATE INDEX "InsightProcessingJob_companyId_createdAt_idx"
ON "InsightProcessingJob"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "InsightProcessingItem_jobId_status_idx"
ON "InsightProcessingItem"("jobId", "status");

-- CreateIndex
CREATE INDEX "InsightProcessingItem_receiptId_status_idx"
ON "InsightProcessingItem"("receiptId", "status");

-- CreateIndex
CREATE INDEX "InsightProcessingItem_documentId_status_idx"
ON "InsightProcessingItem"("documentId", "status");

-- CreateIndex
CREATE INDEX "InsightProcessingItem_receiptId_documentId_processingVersio_idx"
ON "InsightProcessingItem"("receiptId", "documentId", "processingVersion");

-- CreateIndex
CREATE UNIQUE INDEX "InsightProcessingItem_jobId_itemKey_key"
ON "InsightProcessingItem"("jobId", "itemKey");

-- AddForeignKey
ALTER TABLE "InsightProcessingJob"
ADD CONSTRAINT "InsightProcessingJob_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightProcessingJob"
ADD CONSTRAINT "InsightProcessingJob_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightProcessingItem"
ADD CONSTRAINT "InsightProcessingItem_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "InsightProcessingJob"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightProcessingItem"
ADD CONSTRAINT "InsightProcessingItem_receiptId_fkey"
FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightProcessingItem"
ADD CONSTRAINT "InsightProcessingItem_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "AiDetectedDocument"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
