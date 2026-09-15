ALTER TABLE "CompanyTask"
  ADD COLUMN "dataRequestStatus" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "dataDueAt" TIMESTAMP(3),
  ADD COLUMN "reminderStartAt" TIMESTAMP(3),
  ADD COLUMN "reminderIntervalDays" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "lastReminderAt" TIMESTAMP(3),
  ADD COLUMN "clientSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "clientSubmittedByUserId" INTEGER,
  ADD COLUMN "dataReviewedAt" TIMESTAMP(3),
  ADD COLUMN "dataReviewedByUserId" INTEGER;

ALTER TABLE "CompanyTask"
  ADD CONSTRAINT "CompanyTask_clientSubmittedByUserId_fkey"
  FOREIGN KEY ("clientSubmittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CompanyTask"
  ADD CONSTRAINT "CompanyTask_dataReviewedByUserId_fkey"
  FOREIGN KEY ("dataReviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CompanyTask_companyId_dataRequestStatus_dataDueAt_idx"
  ON "CompanyTask"("companyId", "dataRequestStatus", "dataDueAt");

-- Virk sjálfvirk VSK-verkefni fá fyrsta gagnaskilaferlið strax.
-- Sjálfgefið: gögn 15. dag næsta mánaðar eftir tímabilslok,
-- fyrsta áminning 5 dögum fyrr. Dagsetningarnar má síðan stilla á verkefninu.
UPDATE "CompanyTask"
SET
  "dataRequestStatus" = 'REQUESTED',
  "dataDueAt" = date_trunc('month', "periodEnd" + interval '1 month') + interval '14 days 12 hours',
  "reminderStartAt" = date_trunc('month', "periodEnd" + interval '1 month') + interval '9 days 12 hours',
  "reminderIntervalDays" = 3
WHERE "sourceType" = 'VAT_OBLIGATION'
  AND "status" = 'OPEN'
  AND "periodEnd" IS NOT NULL
  AND "dataRequestStatus" = 'NONE';
