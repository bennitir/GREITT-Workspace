-- Starfsmannakjarni sem er sjálfstæður frá innskráningu og einstökum einingum.
CREATE TABLE "Employee" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER,
    "employeeNumber" TEXT,
    "fullName" TEXT NOT NULL,
    "kennitala" TEXT,
    "address" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'is',
    "jobTitle" TEXT,
    "department" TEXT,
    "employmentKind" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "employmentStartDate" TIMESTAMP(3),
    "employmentEndDate" TIMESTAMP(3),
    "employmentPercent" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeCompensation" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "payType" TEXT NOT NULL DEFAULT 'MONTHLY',
    "monthlySalary" DOUBLE PRECISION,
    "hourlyRate" DOUBLE PRECISION,
    "internalCostPerMinute" DOUBLE PRECISION,
    "internalCostSource" TEXT NOT NULL DEFAULT 'MANUAL',
    "currency" TEXT NOT NULL DEFAULT 'ISK',
    "notes" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeCompensation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeQualification" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "qualificationType" TEXT NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "issuer" TEXT,
    "certificateNumber" TEXT,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmployeeQualification_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkPartAssignment" ADD COLUMN "employeeId" INTEGER;
ALTER TABLE "WorkPartLaborFact" ADD COLUMN "employeeId" INTEGER;

-- Búum aðeins til starfsmannaspjöld þar sem raunveruleg verk/vinnutímagögn
-- sýna að viðkomandi hafi verið notaður sem starfsmaður. UserCompany eitt og sér
-- segir ekki að bókari/stjórnandi sé starfsmaður félagsins.
INSERT INTO "Employee" (
    "companyId", "userId", "fullName", "email", "preferredLanguage",
    "isActive", "createdAt", "updatedAt"
)
SELECT DISTINCT
    source."companyId",
    source."userId",
    u."name",
    u."email",
    COALESCE(us."interfaceLanguage", 'is'),
    COALESCE(uc."isActive", u."isActive", true),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (
    SELECT "companyId", "userId" FROM "WorkPartAssignment" WHERE "userId" IS NOT NULL
    UNION
    SELECT "companyId", "userId" FROM "WorkPartLaborFact" WHERE "userId" IS NOT NULL
    UNION
    SELECT "companyId", "userId" FROM "WorkLog" WHERE "userId" IS NOT NULL
) AS source
JOIN "User" u ON u."id" = source."userId"
LEFT JOIN "UserSettings" us ON us."userId" = source."userId"
LEFT JOIN "UserCompany" uc ON uc."companyId" = source."companyId" AND uc."userId" = source."userId"
ON CONFLICT DO NOTHING;

UPDATE "WorkPartAssignment" a
SET "employeeId" = e."id"
FROM "Employee" e
WHERE a."employeeId" IS NULL
  AND a."userId" IS NOT NULL
  AND e."companyId" = a."companyId"
  AND e."userId" = a."userId";

UPDATE "WorkPartLaborFact" f
SET "employeeId" = e."id"
FROM "Employee" e
WHERE f."employeeId" IS NULL
  AND f."userId" IS NOT NULL
  AND e."companyId" = f."companyId"
  AND e."userId" = f."userId";

CREATE INDEX "Employee_companyId_userId_idx" ON "Employee"("companyId", "userId");
CREATE INDEX "Employee_companyId_employeeNumber_idx" ON "Employee"("companyId", "employeeNumber");
CREATE INDEX "Employee_companyId_isActive_idx" ON "Employee"("companyId", "isActive");
CREATE INDEX "Employee_companyId_fullName_idx" ON "Employee"("companyId", "fullName");
CREATE INDEX "Employee_kennitala_idx" ON "Employee"("kennitala");
CREATE INDEX "EmployeeCompensation_companyId_employeeId_validFrom_idx" ON "EmployeeCompensation"("companyId", "employeeId", "validFrom");
CREATE INDEX "EmployeeCompensation_employeeId_validTo_idx" ON "EmployeeCompensation"("employeeId", "validTo");
CREATE INDEX "EmployeeQualification_companyId_employeeId_idx" ON "EmployeeQualification"("companyId", "employeeId");
CREATE INDEX "EmployeeQualification_employeeId_validUntil_idx" ON "EmployeeQualification"("employeeId", "validUntil");
CREATE INDEX "WorkPartAssignment_employeeId_removedAt_idx" ON "WorkPartAssignment"("employeeId", "removedAt");
CREATE INDEX "WorkPartLaborFact_employeeId_workDate_idx" ON "WorkPartLaborFact"("employeeId", "workDate");

ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeQualification" ADD CONSTRAINT "EmployeeQualification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeQualification" ADD CONSTRAINT "EmployeeQualification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeQualification" ADD CONSTRAINT "EmployeeQualification_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkPartAssignment" ADD CONSTRAINT "WorkPartAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkPartLaborFact" ADD CONSTRAINT "WorkPartLaborFact_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
