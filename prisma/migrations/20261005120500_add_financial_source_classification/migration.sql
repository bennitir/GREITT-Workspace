CREATE TABLE "FinancialSourceClassification" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'USER_CONFIRMED',
    "reason" TEXT,
    "confirmedByUserId" INTEGER,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinancialSourceClassification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialSourceClassification_companyId_sourceType_sourceKey_key"
ON "FinancialSourceClassification"("companyId", "sourceType", "sourceKey");

CREATE INDEX "FinancialSourceClassification_companyId_sourceType_classification_idx"
ON "FinancialSourceClassification"("companyId", "sourceType", "classification");

CREATE INDEX "FinancialSourceClassification_sourceType_sourceKey_idx"
ON "FinancialSourceClassification"("sourceType", "sourceKey");

ALTER TABLE "FinancialSourceClassification"
ADD CONSTRAINT "FinancialSourceClassification_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
