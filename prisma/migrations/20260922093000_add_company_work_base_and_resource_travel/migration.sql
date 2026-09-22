-- Sjálfgefin starfsstöð fyrirtækis, rekjanlegur upphafsstaður Dagbókar
-- og ferðahraði vinnuvéla/farartækja fyrir Dagsmönnun.

ALTER TABLE "Company"
  ADD COLUMN "defaultOperationalLocationId" INTEGER;

ALTER TABLE "WorkResource"
  ADD COLUMN "travelMode" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "planningTravelSpeedKmh" DOUBLE PRECISION;

ALTER TABLE "EmployeeWorkDiaryEntry"
  ADD COLUMN "travelFromOperationalLocationId" INTEGER,
  ADD COLUMN "travelFromLabelSnapshot" TEXT,
  ADD COLUMN "travelToLabelSnapshot" TEXT,
  ADD COLUMN "estimatedTravelMinutes" INTEGER,
  ADD COLUMN "estimatedTravelKm" DOUBLE PRECISION,
  ADD COLUMN "travelEstimateSource" TEXT;

ALTER TABLE "WorkResource"
  ADD CONSTRAINT "WorkResource_travelMode_check"
  CHECK ("travelMode" IN ('NONE', 'ROAD', 'SELF_PROPELLED', 'TRANSPORTED'));

ALTER TABLE "WorkResource"
  ADD CONSTRAINT "WorkResource_planningTravelSpeedKmh_check"
  CHECK ("planningTravelSpeedKmh" IS NULL OR "planningTravelSpeedKmh" > 0);

ALTER TABLE "EmployeeWorkDiaryEntry"
  ADD CONSTRAINT "EmployeeWorkDiaryEntry_estimated_travel_check"
  CHECK (("estimatedTravelMinutes" IS NULL OR "estimatedTravelMinutes" >= 0)
    AND ("estimatedTravelKm" IS NULL OR "estimatedTravelKm" >= 0));

CREATE INDEX "Company_defaultOperationalLocationId_idx"
  ON "Company"("defaultOperationalLocationId");

CREATE INDEX "EmployeeWorkDiaryEntry_travelFromOperationalLocationId_idx"
  ON "EmployeeWorkDiaryEntry"("travelFromOperationalLocationId");

ALTER TABLE "Company"
  ADD CONSTRAINT "Company_defaultOperationalLocationId_fkey"
  FOREIGN KEY ("defaultOperationalLocationId") REFERENCES "OperationalLocation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeWorkDiaryEntry"
  ADD CONSTRAINT "EmployeeWorkDiaryEntry_travelFromOperationalLocationId_fkey"
  FOREIGN KEY ("travelFromOperationalLocationId") REFERENCES "OperationalLocation"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
