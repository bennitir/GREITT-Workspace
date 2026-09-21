-- Sameiginlegur starfsmannakjarni: starfslýsing, ráðningarsamhengi,
-- vinnufyrirkomulag, vaktamynstur og hlutverk sem telja í lágmarksmönnun.

ALTER TABLE "Employee"
  ADD COLUMN "jobDescription" TEXT,
  ADD COLUMN "employmentContractReference" TEXT,
  ADD COLUMN "employmentContractNotes" TEXT,
  ADD COLUMN "shiftPatternId" INTEGER,
  ADD COLUMN "workScheduleType" TEXT NOT NULL DEFAULT 'DAY',
  ADD COLUMN "contractedWeeklyMinutes" INTEGER,
  ADD COLUMN "fixedOvertimeMinutesPerWeek" INTEGER,
  ADD COLUMN "workScheduleNotes" TEXT;

CREATE TABLE "StaffingRole" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StaffingRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeStaffingRole" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "staffingRoleId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeStaffingRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShiftPattern" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "patternType" TEXT NOT NULL DEFAULT 'FIXED_SHIFT',
    "cycleLengthDays" INTEGER NOT NULL DEFAULT 1,
    "anchorDate" DATE,
    "timezone" TEXT NOT NULL DEFAULT 'Atlantic/Reykjavik',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShiftPattern_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShiftPatternSlot" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "shiftPatternId" INTEGER NOT NULL,
    "dayOffset" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "shiftCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "isWorkSlot" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShiftPatternSlot_pkey" PRIMARY KEY ("id")
);

-- Lágmarksmönnun er regla vinnustaðar/deildar, ekki eiginleiki einstaklings.
-- Starfsmannaspjaldið tengir starfsmanninn við StaffingRole sem reglurnar telja.
CREATE TABLE "StaffingCoverageProfile" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "workplaceScheduleProfileId" INTEGER,
    "shiftPatternId" INTEGER,
    "department" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StaffingCoverageProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StaffingCoverageRule" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "staffingCoverageProfileId" INTEGER NOT NULL,
    "staffingRoleId" INTEGER NOT NULL,
    "label" TEXT,
    "dayOfWeekMask" TEXT,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "minimumCount" INTEGER NOT NULL,
    "validFrom" DATE,
    "validTo" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StaffingCoverageRule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_contractedWeeklyMinutes_check"
  CHECK ("contractedWeeklyMinutes" IS NULL OR ("contractedWeeklyMinutes" >= 0 AND "contractedWeeklyMinutes" <= 10080)),
  ADD CONSTRAINT "Employee_fixedOvertimeMinutesPerWeek_check"
  CHECK ("fixedOvertimeMinutesPerWeek" IS NULL OR ("fixedOvertimeMinutesPerWeek" >= 0 AND "fixedOvertimeMinutesPerWeek" <= 10080));

ALTER TABLE "ShiftPattern"
  ADD CONSTRAINT "ShiftPattern_cycleLengthDays_check"
  CHECK ("cycleLengthDays" >= 1 AND "cycleLengthDays" <= 366);

ALTER TABLE "ShiftPatternSlot"
  ADD CONSTRAINT "ShiftPatternSlot_dayOffset_check"
  CHECK ("dayOffset" >= 0 AND "dayOffset" <= 365),
  ADD CONSTRAINT "ShiftPatternSlot_sequence_check"
  CHECK ("sequence" >= 1),
  ADD CONSTRAINT "ShiftPatternSlot_startMinutes_check"
  CHECK ("startMinutes" >= 0 AND "startMinutes" <= 1439),
  ADD CONSTRAINT "ShiftPatternSlot_durationMinutes_check"
  CHECK ("durationMinutes" > 0 AND "durationMinutes" <= 1440);

ALTER TABLE "StaffingCoverageRule"
  ADD CONSTRAINT "StaffingCoverageRule_startMinutes_check"
  CHECK ("startMinutes" >= 0 AND "startMinutes" <= 1439),
  ADD CONSTRAINT "StaffingCoverageRule_endMinutes_check"
  CHECK ("endMinutes" >= 0 AND "endMinutes" <= 1439),
  ADD CONSTRAINT "StaffingCoverageRule_minimumCount_check"
  CHECK ("minimumCount" >= 1);

CREATE UNIQUE INDEX "StaffingRole_companyId_code_key"
  ON "StaffingRole"("companyId", "code");
CREATE UNIQUE INDEX "EmployeeStaffingRole_employeeId_staffingRoleId_key"
  ON "EmployeeStaffingRole"("employeeId", "staffingRoleId");
CREATE UNIQUE INDEX "ShiftPatternSlot_shiftPatternId_dayOffset_sequence_key"
  ON "ShiftPatternSlot"("shiftPatternId", "dayOffset", "sequence");

CREATE INDEX "Employee_shiftPatternId_idx" ON "Employee"("shiftPatternId");
CREATE INDEX "Employee_workScheduleType_idx" ON "Employee"("workScheduleType");
CREATE INDEX "StaffingRole_companyId_isActive_idx" ON "StaffingRole"("companyId", "isActive");
CREATE INDEX "StaffingRole_companyId_name_idx" ON "StaffingRole"("companyId", "name");
CREATE INDEX "EmployeeStaffingRole_companyId_employeeId_isActive_idx" ON "EmployeeStaffingRole"("companyId", "employeeId", "isActive");
CREATE INDEX "EmployeeStaffingRole_staffingRoleId_isActive_idx" ON "EmployeeStaffingRole"("staffingRoleId", "isActive");
CREATE INDEX "ShiftPattern_companyId_isActive_idx" ON "ShiftPattern"("companyId", "isActive");
CREATE INDEX "ShiftPattern_companyId_code_idx" ON "ShiftPattern"("companyId", "code");
CREATE INDEX "ShiftPatternSlot_companyId_idx" ON "ShiftPatternSlot"("companyId");
CREATE INDEX "ShiftPatternSlot_shiftPatternId_dayOffset_idx" ON "ShiftPatternSlot"("shiftPatternId", "dayOffset");
CREATE INDEX "StaffingCoverageProfile_companyId_isActive_idx" ON "StaffingCoverageProfile"("companyId", "isActive");
CREATE INDEX "StaffingCoverageProfile_workplaceScheduleProfileId_idx" ON "StaffingCoverageProfile"("workplaceScheduleProfileId");
CREATE INDEX "StaffingCoverageProfile_shiftPatternId_idx" ON "StaffingCoverageProfile"("shiftPatternId");
CREATE INDEX "StaffingCoverageRule_companyId_idx" ON "StaffingCoverageRule"("companyId");
CREATE INDEX "StaffingCoverageRule_staffingCoverageProfileId_idx" ON "StaffingCoverageRule"("staffingCoverageProfileId");
CREATE INDEX "StaffingCoverageRule_staffingRoleId_idx" ON "StaffingCoverageRule"("staffingRoleId");

ALTER TABLE "StaffingRole"
  ADD CONSTRAINT "StaffingRole_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeStaffingRole"
  ADD CONSTRAINT "EmployeeStaffingRole_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeStaffingRole"
  ADD CONSTRAINT "EmployeeStaffingRole_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeStaffingRole"
  ADD CONSTRAINT "EmployeeStaffingRole_staffingRoleId_fkey"
  FOREIGN KEY ("staffingRoleId") REFERENCES "StaffingRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftPattern"
  ADD CONSTRAINT "ShiftPattern_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftPatternSlot"
  ADD CONSTRAINT "ShiftPatternSlot_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftPatternSlot"
  ADD CONSTRAINT "ShiftPatternSlot_shiftPatternId_fkey"
  FOREIGN KEY ("shiftPatternId") REFERENCES "ShiftPattern"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_shiftPatternId_fkey"
  FOREIGN KEY ("shiftPatternId") REFERENCES "ShiftPattern"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffingCoverageProfile"
  ADD CONSTRAINT "StaffingCoverageProfile_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffingCoverageProfile"
  ADD CONSTRAINT "StaffingCoverageProfile_workplaceScheduleProfileId_fkey"
  FOREIGN KEY ("workplaceScheduleProfileId") REFERENCES "WorkplaceScheduleProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffingCoverageProfile"
  ADD CONSTRAINT "StaffingCoverageProfile_shiftPatternId_fkey"
  FOREIGN KEY ("shiftPatternId") REFERENCES "ShiftPattern"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffingCoverageRule"
  ADD CONSTRAINT "StaffingCoverageRule_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffingCoverageRule"
  ADD CONSTRAINT "StaffingCoverageRule_staffingCoverageProfileId_fkey"
  FOREIGN KEY ("staffingCoverageProfileId") REFERENCES "StaffingCoverageProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffingCoverageRule"
  ADD CONSTRAINT "StaffingCoverageRule_staffingRoleId_fkey"
  FOREIGN KEY ("staffingRoleId") REFERENCES "StaffingRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Verk getur valfrjálst vísað í sama mönnunarhlutverk og starfsmannaspjaldið.
ALTER TABLE "WorkPartStaffingRequirement"
  ADD COLUMN "staffingRoleId" INTEGER;
CREATE INDEX "WorkPartStaffingRequirement_staffingRoleId_idx"
  ON "WorkPartStaffingRequirement"("staffingRoleId");
ALTER TABLE "WorkPartStaffingRequirement"
  ADD CONSTRAINT "WorkPartStaffingRequirement_staffingRoleId_fkey"
  FOREIGN KEY ("staffingRoleId") REFERENCES "StaffingRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
