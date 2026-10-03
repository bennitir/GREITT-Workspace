ALTER TABLE "ImportBatch"
  ADD COLUMN "sourceFileSha256" TEXT,
  ADD COLUMN "sourceFileSize" INTEGER,
  ADD COLUMN "importedCount" INTEGER,
  ADD COLUMN "duplicateCount" INTEGER,
  ADD COLUMN "completedAt" TIMESTAMP(3);

CREATE INDEX "ImportBatch_companyId_sourceType_sourceFileSha256_idx"
  ON "ImportBatch"("companyId", "sourceType", "sourceFileSha256");
