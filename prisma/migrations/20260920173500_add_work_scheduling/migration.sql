ALTER TABLE "WorkOrder"
  ADD COLUMN "plannedDate" DATE,
  ADD COLUMN "plannedStartMinutes" INTEGER;

ALTER TABLE "WorkOrder"
  ADD CONSTRAINT "WorkOrder_plannedStartMinutes_check"
  CHECK ("plannedStartMinutes" IS NULL OR ("plannedStartMinutes" >= 0 AND "plannedStartMinutes" <= 1439));

CREATE INDEX "WorkOrder_companyId_plannedDate_idx"
  ON "WorkOrder"("companyId", "plannedDate");
