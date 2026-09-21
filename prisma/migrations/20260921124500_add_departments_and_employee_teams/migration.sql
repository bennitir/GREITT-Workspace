-- Formlegar deildir/einingar og föst teymi í sameiginlegum starfsmannakjarna.
-- Eldri Employee.department og StaffingCoverageProfile.department textagildi haldast
-- til afturvirkni; ný tengsl eru valfrjáls þar til gögn hafa verið yfirfarin.

CREATE TABLE "CompanyDepartment" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitType" TEXT NOT NULL DEFAULT 'DEPARTMENT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyDepartment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeTeam" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "departmentId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teamType" TEXT NOT NULL DEFAULT 'FIXED',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeTeam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeTeamMembership" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeTeamMembership_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Employee"
  ADD COLUMN "departmentId" INTEGER;

ALTER TABLE "WorkOrder"
  ADD COLUMN "responsibleDepartmentId" INTEGER,
  ADD COLUMN "locationDepartmentId" INTEGER;

ALTER TABLE "StaffingCoverageProfile"
  ADD COLUMN "departmentId" INTEGER;

ALTER TABLE "CompanyDepartment"
  ADD CONSTRAINT "CompanyDepartment_unitType_check"
  CHECK ("unitType" IN ('DIVISION', 'DEPARTMENT', 'UNIT', 'WARD', 'OTHER'));

ALTER TABLE "EmployeeTeam"
  ADD CONSTRAINT "EmployeeTeam_teamType_check"
  CHECK ("teamType" IN ('FIXED', 'FLEXIBLE', 'SUPPORT'));

CREATE UNIQUE INDEX "CompanyDepartment_companyId_code_key"
  ON "CompanyDepartment"("companyId", "code");
CREATE UNIQUE INDEX "EmployeeTeam_companyId_code_key"
  ON "EmployeeTeam"("companyId", "code");
CREATE UNIQUE INDEX "EmployeeTeamMembership_employeeId_teamId_key"
  ON "EmployeeTeamMembership"("employeeId", "teamId");

CREATE INDEX "CompanyDepartment_companyId_isActive_sortOrder_idx"
  ON "CompanyDepartment"("companyId", "isActive", "sortOrder");
CREATE INDEX "CompanyDepartment_parentId_idx"
  ON "CompanyDepartment"("parentId");
CREATE INDEX "EmployeeTeam_companyId_departmentId_isActive_idx"
  ON "EmployeeTeam"("companyId", "departmentId", "isActive");
CREATE INDEX "EmployeeTeam_departmentId_name_idx"
  ON "EmployeeTeam"("departmentId", "name");
CREATE INDEX "EmployeeTeamMembership_companyId_employeeId_isActive_idx"
  ON "EmployeeTeamMembership"("companyId", "employeeId", "isActive");
CREATE INDEX "EmployeeTeamMembership_teamId_isActive_idx"
  ON "EmployeeTeamMembership"("teamId", "isActive");
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");
CREATE INDEX "WorkOrder_responsibleDepartmentId_idx" ON "WorkOrder"("responsibleDepartmentId");
CREATE INDEX "WorkOrder_locationDepartmentId_idx" ON "WorkOrder"("locationDepartmentId");
CREATE INDEX "StaffingCoverageProfile_departmentId_idx" ON "StaffingCoverageProfile"("departmentId");

ALTER TABLE "CompanyDepartment"
  ADD CONSTRAINT "CompanyDepartment_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyDepartment"
  ADD CONSTRAINT "CompanyDepartment_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "CompanyDepartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeTeam"
  ADD CONSTRAINT "EmployeeTeam_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeTeam"
  ADD CONSTRAINT "EmployeeTeam_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "CompanyDepartment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeTeamMembership"
  ADD CONSTRAINT "EmployeeTeamMembership_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeTeamMembership"
  ADD CONSTRAINT "EmployeeTeamMembership_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeTeamMembership"
  ADD CONSTRAINT "EmployeeTeamMembership_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "EmployeeTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "CompanyDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrder"
  ADD CONSTRAINT "WorkOrder_responsibleDepartmentId_fkey"
  FOREIGN KEY ("responsibleDepartmentId") REFERENCES "CompanyDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrder"
  ADD CONSTRAINT "WorkOrder_locationDepartmentId_fkey"
  FOREIGN KEY ("locationDepartmentId") REFERENCES "CompanyDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffingCoverageProfile"
  ADD CONSTRAINT "StaffingCoverageProfile_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "CompanyDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
