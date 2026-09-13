CREATE TABLE "BankAiAnalysisCache" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "patternKey" TEXT NOT NULL,
    "subpatternKey" TEXT NOT NULL,
    "groupFingerprint" TEXT NOT NULL,
    "resultJson" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "totalGroupCount" INTEGER NOT NULL DEFAULT 0,
    "matchedReceiptCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costIsk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "model" TEXT NOT NULL,
    "createdByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BankAiAnalysisCache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BankAiAnalysisCache_bankAccountId_patternKey_subpatternKey_groupFingerprint_key" ON "BankAiAnalysisCache"("bankAccountId", "patternKey", "subpatternKey", "groupFingerprint");
CREATE INDEX "BankAiAnalysisCache_companyId_bankAccountId_idx" ON "BankAiAnalysisCache"("companyId", "bankAccountId");
CREATE INDEX "BankAiAnalysisCache_createdAt_idx" ON "BankAiAnalysisCache"("createdAt");
