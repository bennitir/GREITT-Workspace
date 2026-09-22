-- Mobile + Verk + Dagbók.
-- Sjálfstæð vinna er raunveruleg vinnustaðreynd en á ekki að verða gervi-Verk.
-- Úthlutað Verk heldur áfram að nota WorkPartLaborFact; Dagbók fær eigið sannleikslag.

ALTER TABLE "Employee"
  ADD COLUMN "workExecutionMode" TEXT NOT NULL DEFAULT 'ASSIGNED';

ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_workExecutionMode_check"
  CHECK ("workExecutionMode" IN ('ASSIGNED', 'SELF_DIRECTED', 'MIXED'));

CREATE TABLE "EmployeeWorkDiaryEntry" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "workDate" DATE NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "noteSourceLanguage" TEXT NOT NULL DEFAULT 'is',
    "workKey" TEXT,
    "operationalLocationId" INTEGER,
    "locationText" TEXT,
    "travelMinutes" INTEGER,
    "travelKm" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'MOBILE',
    "createdById" INTEGER,
    "voidedAt" TIMESTAMP(3),
    "voidedById" INTEGER,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeWorkDiaryEntry_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "EmployeeWorkDiaryEntry"
  ADD CONSTRAINT "EmployeeWorkDiaryEntry_source_check"
  CHECK ("source" IN ('MOBILE', 'MANUAL', 'IMPORTED', 'API'));
ALTER TABLE "EmployeeWorkDiaryEntry"
  ADD CONSTRAINT "EmployeeWorkDiaryEntry_duration_check"
  CHECK ("durationMinutes" >= 0);
ALTER TABLE "EmployeeWorkDiaryEntry"
  ADD CONSTRAINT "EmployeeWorkDiaryEntry_travel_check"
  CHECK (("travelMinutes" IS NULL OR "travelMinutes" >= 0) AND ("travelKm" IS NULL OR "travelKm" >= 0));

CREATE INDEX "Employee_workExecutionMode_idx" ON "Employee"("workExecutionMode");
CREATE INDEX "EmployeeWorkDiaryEntry_companyId_workDate_idx" ON "EmployeeWorkDiaryEntry"("companyId", "workDate");
CREATE INDEX "EmployeeWorkDiaryEntry_employeeId_workDate_idx" ON "EmployeeWorkDiaryEntry"("employeeId", "workDate");
CREATE INDEX "EmployeeWorkDiaryEntry_companyId_employeeId_endedAt_idx" ON "EmployeeWorkDiaryEntry"("companyId", "employeeId", "endedAt");
CREATE INDEX "EmployeeWorkDiaryEntry_operationalLocationId_idx" ON "EmployeeWorkDiaryEntry"("operationalLocationId");
CREATE INDEX "EmployeeWorkDiaryEntry_source_idx" ON "EmployeeWorkDiaryEntry"("source");

ALTER TABLE "EmployeeWorkDiaryEntry"
  ADD CONSTRAINT "EmployeeWorkDiaryEntry_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeWorkDiaryEntry"
  ADD CONSTRAINT "EmployeeWorkDiaryEntry_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeWorkDiaryEntry"
  ADD CONSTRAINT "EmployeeWorkDiaryEntry_operationalLocationId_fkey"
  FOREIGN KEY ("operationalLocationId") REFERENCES "OperationalLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeWorkDiaryEntry"
  ADD CONSTRAINT "EmployeeWorkDiaryEntry_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeWorkDiaryEntry"
  ADD CONSTRAINT "EmployeeWorkDiaryEntry_voidedById_fkey"
  FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
