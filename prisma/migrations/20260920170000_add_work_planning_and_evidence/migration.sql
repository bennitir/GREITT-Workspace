-- GLÖGGT Verk – mönnunar-/tímaáætlun og valkvæð myndastaðfesting.

ALTER TABLE "WorkOrder"
  ADD COLUMN "requiredPeople" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "estimatedMinutes" INTEGER,
  ADD COLUMN "photoRequirement" TEXT NOT NULL DEFAULT 'NONE';

ALTER TABLE "WorkPart"
  ADD COLUMN "requiredPeople" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "estimatedMinutes" INTEGER,
  ADD COLUMN "photoRequirement" TEXT NOT NULL DEFAULT 'INHERIT';

CREATE TABLE "WorkEvidencePhoto" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "workOrderId" INTEGER NOT NULL,
  "workPartId" INTEGER,
  "stage" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "fileName" TEXT,
  "mimeType" TEXT,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkEvidencePhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkEvidencePhoto_companyId_workOrderId_createdAt_idx"
ON "WorkEvidencePhoto"("companyId", "workOrderId", "createdAt");

CREATE INDEX "WorkEvidencePhoto_workPartId_stage_idx"
ON "WorkEvidencePhoto"("workPartId", "stage");

CREATE INDEX "WorkEvidencePhoto_createdById_idx"
ON "WorkEvidencePhoto"("createdById");

ALTER TABLE "WorkEvidencePhoto" ADD CONSTRAINT "WorkEvidencePhoto_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkEvidencePhoto" ADD CONSTRAINT "WorkEvidencePhoto_workOrderId_fkey"
  FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkEvidencePhoto" ADD CONSTRAINT "WorkEvidencePhoto_workPartId_fkey"
  FOREIGN KEY ("workPartId") REFERENCES "WorkPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkEvidencePhoto" ADD CONSTRAINT "WorkEvidencePhoto_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
