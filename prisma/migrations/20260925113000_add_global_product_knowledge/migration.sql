-- Sameiginlegt vöruþekkingarlag GLÖGGT.
-- Geymir almenna merkingu vöru, en aldrei fyrirtækjasértækan bókunarlykil.

CREATE TABLE "GlobalProductKnowledge" (
    "id" SERIAL NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "productKind" TEXT NOT NULL,
    "categoryCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CANDIDATE',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confirmationCount" INTEGER NOT NULL DEFAULT 0,
    "correctionCount" INTEGER NOT NULL DEFAULT 0,
    "independentCompanyCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalProductKnowledge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GlobalProductKnowledgeEvidence" (
    "id" SERIAL NOT NULL,
    "knowledgeId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "receiptId" INTEGER,
    "documentId" INTEGER,
    "userId" INTEGER,
    "evidenceKey" TEXT NOT NULL,
    "observedText" TEXT NOT NULL,
    "normalizedObservedText" TEXT NOT NULL,
    "proposedProductKind" TEXT NOT NULL,
    "proposedCategoryCode" TEXT,
    "transactionContext" TEXT,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlobalProductKnowledgeEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GlobalProductKnowledge_canonicalKey_key"
ON "GlobalProductKnowledge"("canonicalKey");
CREATE INDEX "GlobalProductKnowledge_status_productKind_idx"
ON "GlobalProductKnowledge"("status", "productKind");
CREATE INDEX "GlobalProductKnowledge_categoryCode_idx"
ON "GlobalProductKnowledge"("categoryCode");

CREATE UNIQUE INDEX "GlobalProductKnowledgeEvidence_evidenceKey_key"
ON "GlobalProductKnowledgeEvidence"("evidenceKey");
CREATE INDEX "GlobalProductKnowledgeEvidence_knowledgeId_createdAt_idx"
ON "GlobalProductKnowledgeEvidence"("knowledgeId", "createdAt");
CREATE INDEX "GlobalProductKnowledgeEvidence_companyId_createdAt_idx"
ON "GlobalProductKnowledgeEvidence"("companyId", "createdAt");
CREATE INDEX "GlobalProductKnowledgeEvidence_receiptId_idx"
ON "GlobalProductKnowledgeEvidence"("receiptId");
CREATE INDEX "GlobalProductKnowledgeEvidence_documentId_idx"
ON "GlobalProductKnowledgeEvidence"("documentId");
CREATE INDEX "GlobalProductKnowledgeEvidence_userId_idx"
ON "GlobalProductKnowledgeEvidence"("userId");

ALTER TABLE "GlobalProductKnowledgeEvidence"
ADD CONSTRAINT "GlobalProductKnowledgeEvidence_knowledgeId_fkey"
FOREIGN KEY ("knowledgeId") REFERENCES "GlobalProductKnowledge"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GlobalProductKnowledgeEvidence"
ADD CONSTRAINT "GlobalProductKnowledgeEvidence_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GlobalProductKnowledgeEvidence"
ADD CONSTRAINT "GlobalProductKnowledgeEvidence_receiptId_fkey"
FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GlobalProductKnowledgeEvidence"
ADD CONSTRAINT "GlobalProductKnowledgeEvidence_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "AiDetectedDocument"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GlobalProductKnowledgeEvidence"
ADD CONSTRAINT "GlobalProductKnowledgeEvidence_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
