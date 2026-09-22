-- Aðaltæki/vinnuvél á sjálfstæðri Dagbókarfærslu.
-- Snapshot-reitir varðveita sögulega merkingu og ferðahraða.

ALTER TABLE "EmployeeWorkDiaryEntry"
  ADD COLUMN "workResourceId" INTEGER,
  ADD COLUMN "workResourceCodeSnapshot" TEXT,
  ADD COLUMN "workResourceNameSnapshot" TEXT,
  ADD COLUMN "resourceTravelModeSnapshot" TEXT,
  ADD COLUMN "resourceTravelSpeedKmhSnapshot" DOUBLE PRECISION;

ALTER TABLE "EmployeeWorkDiaryEntry"
  ADD CONSTRAINT "EmployeeWorkDiaryEntry_resourceTravelModeSnapshot_check"
  CHECK ("resourceTravelModeSnapshot" IS NULL OR "resourceTravelModeSnapshot" IN ('NONE', 'ROAD', 'SELF_PROPELLED', 'TRANSPORTED'));

ALTER TABLE "EmployeeWorkDiaryEntry"
  ADD CONSTRAINT "EmployeeWorkDiaryEntry_resourceTravelSpeedKmhSnapshot_check"
  CHECK ("resourceTravelSpeedKmhSnapshot" IS NULL OR "resourceTravelSpeedKmhSnapshot" > 0);

CREATE INDEX "EmployeeWorkDiaryEntry_workResourceId_idx"
  ON "EmployeeWorkDiaryEntry"("workResourceId");

ALTER TABLE "EmployeeWorkDiaryEntry"
  ADD CONSTRAINT "EmployeeWorkDiaryEntry_workResourceId_fkey"
  FOREIGN KEY ("workResourceId") REFERENCES "WorkResource"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
