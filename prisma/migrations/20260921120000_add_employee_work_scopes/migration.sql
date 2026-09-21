-- Starfssvið starfsmanns er sameiginlegur hluti starfsmannakjarnans.
-- Verk notar það sem harða síu áður en hæfni, tími og röðun eru metin.
-- "Önnur tilfallandi störf" eru skýr undantekning og fara aldrei fram hjá
-- skyldum hæfni-/réttindakröfum Verks.

ALTER TABLE "Employee"
  ADD COLUMN "incidentalWorkMode" TEXT NOT NULL DEFAULT 'NEVER',
  ADD COLUMN "incidentalWorkNotes" TEXT;

ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_incidentalWorkMode_check"
  CHECK ("incidentalWorkMode" IN ('NEVER', 'MANUAL_ONLY', 'AUTO_IF_NEEDED'));

CREATE TABLE "WorkScope" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkScope_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeWorkScope" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "workScopeId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeWorkScope_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkPart"
  ADD COLUMN "workScopeId" INTEGER;

ALTER TABLE "WorkPartStaffingRequirement"
  ADD COLUMN "workScopeId" INTEGER;

CREATE UNIQUE INDEX "WorkScope_companyId_code_key"
  ON "WorkScope"("companyId", "code");
CREATE UNIQUE INDEX "EmployeeWorkScope_employeeId_workScopeId_key"
  ON "EmployeeWorkScope"("employeeId", "workScopeId");

CREATE INDEX "Employee_incidentalWorkMode_idx" ON "Employee"("incidentalWorkMode");
CREATE INDEX "WorkScope_companyId_isActive_idx" ON "WorkScope"("companyId", "isActive");
CREATE INDEX "WorkScope_companyId_name_idx" ON "WorkScope"("companyId", "name");
CREATE INDEX "EmployeeWorkScope_companyId_employeeId_isActive_idx" ON "EmployeeWorkScope"("companyId", "employeeId", "isActive");
CREATE INDEX "EmployeeWorkScope_workScopeId_isActive_idx" ON "EmployeeWorkScope"("workScopeId", "isActive");
CREATE INDEX "WorkPart_workScopeId_idx" ON "WorkPart"("workScopeId");
CREATE INDEX "WorkPartStaffingRequirement_workScopeId_idx" ON "WorkPartStaffingRequirement"("workScopeId");

ALTER TABLE "WorkScope"
  ADD CONSTRAINT "WorkScope_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeWorkScope"
  ADD CONSTRAINT "EmployeeWorkScope_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeWorkScope"
  ADD CONSTRAINT "EmployeeWorkScope_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeWorkScope"
  ADD CONSTRAINT "EmployeeWorkScope_workScopeId_fkey"
  FOREIGN KEY ("workScopeId") REFERENCES "WorkScope"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkPart"
  ADD CONSTRAINT "WorkPart_workScopeId_fkey"
  FOREIGN KEY ("workScopeId") REFERENCES "WorkScope"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkPartStaffingRequirement"
  ADD CONSTRAINT "WorkPartStaffingRequirement_workScopeId_fkey"
  FOREIGN KEY ("workScopeId") REFERENCES "WorkScope"("id") ON DELETE SET NULL ON UPDATE CASCADE;
