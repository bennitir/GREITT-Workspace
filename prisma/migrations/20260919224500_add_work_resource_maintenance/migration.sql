-- Verk: QR-merki, viðhaldslyklar og viðhaldssaga.
-- QR-token eru stytt í 16 hex stafi svo GLÖGGT geti myndað einfalt QR-merki
-- án ytri þjónustu. Engin merki hafa verið gefin út úr fyrri grunninum.

UPDATE "WorkResource"
SET "qrToken" = substr(md5(coalesce("qrToken", '') || ':' || "id"::text || ':' || "companyId"::text), 1, 16)
WHERE "qrToken" IS NOT NULL
  AND length("qrToken") <> 16;

CREATE TABLE "WorkResourceMaintenanceKey" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "workResourceId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "intervalValue" DOUBLE PRECISION,
    "warningLeadValue" DOUBLE PRECISION,
    "lastCompletedMeterValue" DOUBLE PRECISION,
    "nextDueMeterValue" DOUBLE PRECISION,
    "lastCompletedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkResourceMaintenanceKey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkResourceMaintenanceLog" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "workResourceId" INTEGER NOT NULL,
    "maintenanceKeyId" INTEGER NOT NULL,
    "workPartId" INTEGER,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "meterValue" DOUBLE PRECISION,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkResourceMaintenanceLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkResourceMaintenanceKey_workResourceId_code_key"
ON "WorkResourceMaintenanceKey"("workResourceId", "code");
CREATE INDEX "WorkResourceMaintenanceKey_companyId_workResourceId_isActive_idx"
ON "WorkResourceMaintenanceKey"("companyId", "workResourceId", "isActive");
CREATE INDEX "WorkResourceMaintenanceKey_companyId_nextDueMeterValue_idx"
ON "WorkResourceMaintenanceKey"("companyId", "nextDueMeterValue");
CREATE INDEX "WorkResourceMaintenanceLog_companyId_workResourceId_completedAt_idx"
ON "WorkResourceMaintenanceLog"("companyId", "workResourceId", "completedAt");
CREATE INDEX "WorkResourceMaintenanceLog_maintenanceKeyId_completedAt_idx"
ON "WorkResourceMaintenanceLog"("maintenanceKeyId", "completedAt");
CREATE INDEX "WorkResourceMaintenanceLog_workPartId_idx"
ON "WorkResourceMaintenanceLog"("workPartId");

ALTER TABLE "WorkResourceMaintenanceKey"
ADD CONSTRAINT "WorkResourceMaintenanceKey_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkResourceMaintenanceKey"
ADD CONSTRAINT "WorkResourceMaintenanceKey_workResourceId_fkey"
FOREIGN KEY ("workResourceId") REFERENCES "WorkResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkResourceMaintenanceLog"
ADD CONSTRAINT "WorkResourceMaintenanceLog_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkResourceMaintenanceLog"
ADD CONSTRAINT "WorkResourceMaintenanceLog_workResourceId_fkey"
FOREIGN KEY ("workResourceId") REFERENCES "WorkResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkResourceMaintenanceLog"
ADD CONSTRAINT "WorkResourceMaintenanceLog_maintenanceKeyId_fkey"
FOREIGN KEY ("maintenanceKeyId") REFERENCES "WorkResourceMaintenanceKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
