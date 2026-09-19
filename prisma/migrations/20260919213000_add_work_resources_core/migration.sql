-- Verk – sameiginlegur auðlindakjarni fyrir teymi, vinnuvélar, farartæki,
-- verkfæri og verktaka. PERSON heldur áfram að byggja á Employee.

CREATE TABLE "WorkResource" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "sourceLanguage" TEXT NOT NULL DEFAULT 'is',
  "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
  "baseUnit" TEXT,
  "customUnit" TEXT,
  "costRateIsk" DOUBLE PRECISION,
  "saleRateIsk" DOUBLE PRECISION,
  "meterUnit" TEXT,
  "meterValue" DOUBLE PRECISION,
  "qrToken" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" INTEGER,
  "updatedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkResourceMember" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "workResourceId" INTEGER NOT NULL,
  "employeeId" INTEGER NOT NULL,
  "roleLabel" TEXT,
  "createdById" INTEGER,
  "removedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkResourceMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkResourceMeterReading" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "workResourceId" INTEGER NOT NULL,
  "workPartId" INTEGER,
  "readingAt" TIMESTAMP(3) NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL,
  "photoPath" TEXT,
  "note" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkResourceMeterReading_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkPartAssignment" ADD COLUMN "workResourceId" INTEGER;
ALTER TABLE "WorkPartUsageFact" ADD COLUMN "workResourceId" INTEGER,
  ADD COLUMN "resourceUnitCostIsk" DOUBLE PRECISION;

CREATE UNIQUE INDEX "WorkResource_qrToken_key" ON "WorkResource"("qrToken");
CREATE UNIQUE INDEX "WorkResource_companyId_code_key" ON "WorkResource"("companyId", "code");
CREATE INDEX "WorkResource_companyId_kind_isActive_idx" ON "WorkResource"("companyId", "kind", "isActive");
CREATE INDEX "WorkResource_companyId_status_idx" ON "WorkResource"("companyId", "status");
CREATE INDEX "WorkResource_companyId_name_idx" ON "WorkResource"("companyId", "name");
CREATE INDEX "WorkResourceMember_companyId_workResourceId_removedAt_idx" ON "WorkResourceMember"("companyId", "workResourceId", "removedAt");
CREATE INDEX "WorkResourceMember_employeeId_removedAt_idx" ON "WorkResourceMember"("employeeId", "removedAt");
CREATE INDEX "WorkResourceMeterReading_companyId_workResourceId_readingAt_idx" ON "WorkResourceMeterReading"("companyId", "workResourceId", "readingAt");
CREATE INDEX "WorkResourceMeterReading_workPartId_idx" ON "WorkResourceMeterReading"("workPartId");
CREATE INDEX "WorkPartAssignment_workResourceId_removedAt_idx" ON "WorkPartAssignment"("workResourceId", "removedAt");
CREATE INDEX "WorkPartUsageFact_workResourceId_idx" ON "WorkPartUsageFact"("workResourceId");

ALTER TABLE "WorkResource"
  ADD CONSTRAINT "WorkResource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "WorkResource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "WorkResource_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkResourceMember"
  ADD CONSTRAINT "WorkResourceMember_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "WorkResourceMember_workResourceId_fkey" FOREIGN KEY ("workResourceId") REFERENCES "WorkResource"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "WorkResourceMember_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "WorkResourceMember_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkResourceMeterReading"
  ADD CONSTRAINT "WorkResourceMeterReading_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "WorkResourceMeterReading_workResourceId_fkey" FOREIGN KEY ("workResourceId") REFERENCES "WorkResource"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "WorkResourceMeterReading_workPartId_fkey" FOREIGN KEY ("workPartId") REFERENCES "WorkPart"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "WorkResourceMeterReading_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkPartAssignment"
  ADD CONSTRAINT "WorkPartAssignment_workResourceId_fkey" FOREIGN KEY ("workResourceId") REFERENCES "WorkResource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkPartUsageFact"
  ADD CONSTRAINT "WorkPartUsageFact_workResourceId_fkey" FOREIGN KEY ("workResourceId") REFERENCES "WorkResource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
