-- Vinnustaðarprófíll: rekstrarleg skipan dagsins og hlé.
CREATE TABLE "WorkplaceScheduleProfile" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Atlantic/Reykjavik',
    "dayStartMinutes" INTEGER NOT NULL DEFAULT 480,
    "standardWorkMinutes" INTEGER NOT NULL DEFAULT 480,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkplaceScheduleProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkplaceBreakRule" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "workplaceScheduleProfileId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "targetStartMinutes" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "flexibleBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
    "flexibleAfterMinutes" INTEGER NOT NULL DEFAULT 30,
    "allowFinishNearCompleteWork" BOOLEAN NOT NULL DEFAULT true,
    "finishNearCompleteThresholdMinutes" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkplaceBreakRule_pkey" PRIMARY KEY ("id")
);

-- Kjarasamningsprófíll er vísvitandi aðskilinn frá vinnustaðarreglum.
-- Launaleg túlkun ótekins hlés er ekki hardkóðuð; REVIEW er örugg sjálfgefin staða.
CREATE TABLE "LaborAgreementProfile" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "validFrom" DATE,
    "validTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "interpretationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LaborAgreementProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LaborAgreementBreakRule" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "laborAgreementProfileId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "breakCode" TEXT NOT NULL,
    "minimumShiftMinutes" INTEGER NOT NULL DEFAULT 0,
    "entitlementMinutes" INTEGER,
    "paidBreak" BOOLEAN,
    "missedBreakTreatment" TEXT NOT NULL DEFAULT 'REVIEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LaborAgreementBreakRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeBreakEvent" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "workDate" DATE NOT NULL,
    "breakCode" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PLANNED',
    "plannedStartMinutes" INTEGER,
    "plannedDurationMinutes" INTEGER,
    "actualStartedAt" TIMESTAMP(3),
    "actualEndedAt" TIMESTAMP(3),
    "actualDurationMinutes" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeBreakEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Employee"
  ADD COLUMN "workplaceScheduleProfileId" INTEGER,
  ADD COLUMN "laborAgreementProfileId" INTEGER;

-- Grunnvarnir gegn ómögulegum mínútugildum.
ALTER TABLE "WorkplaceScheduleProfile"
  ADD CONSTRAINT "WorkplaceScheduleProfile_dayStartMinutes_check"
  CHECK ("dayStartMinutes" >= 0 AND "dayStartMinutes" <= 1439),
  ADD CONSTRAINT "WorkplaceScheduleProfile_standardWorkMinutes_check"
  CHECK ("standardWorkMinutes" > 0 AND "standardWorkMinutes" <= 1440);

ALTER TABLE "WorkplaceBreakRule"
  ADD CONSTRAINT "WorkplaceBreakRule_targetStartMinutes_check"
  CHECK ("targetStartMinutes" >= 0 AND "targetStartMinutes" <= 1439),
  ADD CONSTRAINT "WorkplaceBreakRule_durationMinutes_check"
  CHECK ("durationMinutes" > 0 AND "durationMinutes" <= 240),
  ADD CONSTRAINT "WorkplaceBreakRule_flexibleBeforeMinutes_check"
  CHECK ("flexibleBeforeMinutes" >= 0 AND "flexibleBeforeMinutes" <= 240),
  ADD CONSTRAINT "WorkplaceBreakRule_flexibleAfterMinutes_check"
  CHECK ("flexibleAfterMinutes" >= 0 AND "flexibleAfterMinutes" <= 240),
  ADD CONSTRAINT "WorkplaceBreakRule_finishThreshold_check"
  CHECK ("finishNearCompleteThresholdMinutes" >= 0 AND "finishNearCompleteThresholdMinutes" <= 240);

ALTER TABLE "LaborAgreementBreakRule"
  ADD CONSTRAINT "LaborAgreementBreakRule_minimumShiftMinutes_check"
  CHECK ("minimumShiftMinutes" >= 0 AND "minimumShiftMinutes" <= 1440),
  ADD CONSTRAINT "LaborAgreementBreakRule_entitlementMinutes_check"
  CHECK ("entitlementMinutes" IS NULL OR ("entitlementMinutes" > 0 AND "entitlementMinutes" <= 240));

ALTER TABLE "EmployeeBreakEvent"
  ADD CONSTRAINT "EmployeeBreakEvent_plannedStartMinutes_check"
  CHECK ("plannedStartMinutes" IS NULL OR ("plannedStartMinutes" >= 0 AND "plannedStartMinutes" <= 1439)),
  ADD CONSTRAINT "EmployeeBreakEvent_plannedDurationMinutes_check"
  CHECK ("plannedDurationMinutes" IS NULL OR ("plannedDurationMinutes" >= 0 AND "plannedDurationMinutes" <= 240)),
  ADD CONSTRAINT "EmployeeBreakEvent_actualDurationMinutes_check"
  CHECK ("actualDurationMinutes" IS NULL OR ("actualDurationMinutes" >= 0 AND "actualDurationMinutes" <= 240));

CREATE UNIQUE INDEX "WorkplaceBreakRule_workplaceScheduleProfileId_code_key"
  ON "WorkplaceBreakRule"("workplaceScheduleProfileId", "code");
CREATE UNIQUE INDEX "WorkplaceBreakRule_workplaceScheduleProfileId_sequence_key"
  ON "WorkplaceBreakRule"("workplaceScheduleProfileId", "sequence");
CREATE UNIQUE INDEX "LaborAgreementBreakRule_laborAgreementProfileId_breakCode_key"
  ON "LaborAgreementBreakRule"("laborAgreementProfileId", "breakCode");
CREATE UNIQUE INDEX "LaborAgreementBreakRule_laborAgreementProfileId_sequence_key"
  ON "LaborAgreementBreakRule"("laborAgreementProfileId", "sequence");

CREATE INDEX "WorkplaceScheduleProfile_companyId_isActive_idx"
  ON "WorkplaceScheduleProfile"("companyId", "isActive");
CREATE INDEX "WorkplaceScheduleProfile_companyId_isDefault_idx"
  ON "WorkplaceScheduleProfile"("companyId", "isDefault");
CREATE INDEX "WorkplaceBreakRule_companyId_idx"
  ON "WorkplaceBreakRule"("companyId");
CREATE INDEX "WorkplaceBreakRule_workplaceScheduleProfileId_idx"
  ON "WorkplaceBreakRule"("workplaceScheduleProfileId");
CREATE INDEX "LaborAgreementProfile_companyId_isActive_idx"
  ON "LaborAgreementProfile"("companyId", "isActive");
CREATE INDEX "LaborAgreementProfile_companyId_code_idx"
  ON "LaborAgreementProfile"("companyId", "code");
CREATE INDEX "LaborAgreementBreakRule_companyId_idx"
  ON "LaborAgreementBreakRule"("companyId");
CREATE INDEX "LaborAgreementBreakRule_laborAgreementProfileId_idx"
  ON "LaborAgreementBreakRule"("laborAgreementProfileId");
CREATE INDEX "Employee_workplaceScheduleProfileId_idx"
  ON "Employee"("workplaceScheduleProfileId");
CREATE INDEX "Employee_laborAgreementProfileId_idx"
  ON "Employee"("laborAgreementProfileId");
CREATE INDEX "EmployeeBreakEvent_companyId_workDate_idx"
  ON "EmployeeBreakEvent"("companyId", "workDate");
CREATE INDEX "EmployeeBreakEvent_employeeId_workDate_idx"
  ON "EmployeeBreakEvent"("employeeId", "workDate");
CREATE INDEX "EmployeeBreakEvent_employeeId_state_idx"
  ON "EmployeeBreakEvent"("employeeId", "state");

ALTER TABLE "WorkplaceScheduleProfile"
  ADD CONSTRAINT "WorkplaceScheduleProfile_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkplaceBreakRule"
  ADD CONSTRAINT "WorkplaceBreakRule_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkplaceBreakRule"
  ADD CONSTRAINT "WorkplaceBreakRule_workplaceScheduleProfileId_fkey"
  FOREIGN KEY ("workplaceScheduleProfileId") REFERENCES "WorkplaceScheduleProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LaborAgreementProfile"
  ADD CONSTRAINT "LaborAgreementProfile_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LaborAgreementBreakRule"
  ADD CONSTRAINT "LaborAgreementBreakRule_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LaborAgreementBreakRule"
  ADD CONSTRAINT "LaborAgreementBreakRule_laborAgreementProfileId_fkey"
  FOREIGN KEY ("laborAgreementProfileId") REFERENCES "LaborAgreementProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_workplaceScheduleProfileId_fkey"
  FOREIGN KEY ("workplaceScheduleProfileId") REFERENCES "WorkplaceScheduleProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_laborAgreementProfileId_fkey"
  FOREIGN KEY ("laborAgreementProfileId") REFERENCES "LaborAgreementProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeBreakEvent"
  ADD CONSTRAINT "EmployeeBreakEvent_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeBreakEvent"
  ADD CONSTRAINT "EmployeeBreakEvent_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
