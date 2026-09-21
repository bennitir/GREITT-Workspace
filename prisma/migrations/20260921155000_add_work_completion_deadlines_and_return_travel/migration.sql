-- Skuldbundinn lokatími og rekjanleg dagsloka-undantekning á Verki.
ALTER TABLE "WorkOrder"
  ADD COLUMN "completionDeadlineDate" DATE,
  ADD COLUMN "completionDeadlineMinutes" INTEGER,
  ADD COLUMN "allowAfterWorkdayEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "workdayEndExceptionReason" TEXT;

CREATE INDEX "WorkOrder_companyId_completionDeadlineDate_idx"
  ON "WorkOrder"("companyId", "completionDeadlineDate");

-- Ferðaáætlun þarf að geta varðveitt bæði ferð á Verk og síðustu heimferð á starfstöð.
ALTER TABLE "WorkTravelPlanLeg"
  ADD COLUMN "legType" TEXT NOT NULL DEFAULT 'TO_WORK';

DROP INDEX IF EXISTS "WorkTravelPlanLeg_workOrderId_employeeId_plannedDate_key";
CREATE UNIQUE INDEX "WorkTravelPlanLeg_workOrderId_employeeId_plannedDate_legType_key"
  ON "WorkTravelPlanLeg"("workOrderId", "employeeId", "plannedDate", "legType");
