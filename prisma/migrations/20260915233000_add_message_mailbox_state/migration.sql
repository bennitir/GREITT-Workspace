ALTER TABLE "CompanyMessage"
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "trashedAt" TIMESTAMP(3);

CREATE INDEX "CompanyMessage_companyId_recipientUserId_archivedAt_trashedAt_idx"
ON "CompanyMessage"("companyId", "recipientUserId", "archivedAt", "trashedAt");

CREATE INDEX "CompanyMessage_companyId_createdByUserId_createdAt_idx"
ON "CompanyMessage"("companyId", "createdByUserId", "createdAt");
