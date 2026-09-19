-- Gögn fyrst, AI síðan fyrir fylgiskjöl.
-- Nýju dálkarnir eru nullable til að varðveita eldri gögn óbreytt.
-- ingestKey er aðeins fylltur fyrir ný/endurunnin skjöl og veitir race-safe
-- exact-duplicate vörn án þess að migration þurfi að eyða eldri tvítekningum.

ALTER TABLE "Receipt"
  ADD COLUMN "ingestKey" TEXT,
  ADD COLUMN "sourceText" TEXT,
  ADD COLUMN "sourceTextHash" TEXT,
  ADD COLUMN "sourceTextSource" TEXT,
  ADD COLUMN "deterministicData" JSONB,
  ADD COLUMN "processingVersion" TEXT,
  ADD COLUMN "lastAnalyzedAt" TIMESTAMP(3),
  ADD COLUMN "analysisLeaseUntil" TIMESTAMP(3);

CREATE UNIQUE INDEX "Receipt_ingestKey_key"
  ON "Receipt"("ingestKey");
CREATE INDEX "Receipt_companyId_fileHash_idx"
  ON "Receipt"("companyId", "fileHash");
CREATE INDEX "Receipt_sourceTextHash_idx"
  ON "Receipt"("sourceTextHash");

ALTER TABLE "AiDetectedDocument"
  ADD COLUMN "documentFingerprint" TEXT,
  ADD COLUMN "processingVersion" TEXT,
  ADD COLUMN "extractionMetadata" JSONB,
  ADD COLUMN "insightMode" TEXT;

CREATE UNIQUE INDEX "AiDetectedDocument_receiptId_documentFingerprint_key"
  ON "AiDetectedDocument"("receiptId", "documentFingerprint");
CREATE INDEX "AiDetectedDocument_documentFingerprint_idx"
  ON "AiDetectedDocument"("documentFingerprint");
CREATE INDEX "AiDetectedDocument_insightMode_idx"
  ON "AiDetectedDocument"("insightMode");

ALTER TABLE "AiUsage"
  ADD COLUMN "pipelineStage" TEXT,
  ADD COLUMN "operationKey" TEXT,
  ADD COLUMN "metadata" JSONB;

CREATE INDEX "AiUsage_pipelineStage_createdAt_idx"
  ON "AiUsage"("pipelineStage", "createdAt");
CREATE INDEX "AiUsage_receiptId_createdAt_idx"
  ON "AiUsage"("receiptId", "createdAt");
CREATE INDEX "AiUsage_operationKey_idx"
  ON "AiUsage"("operationKey");
