-- Verk – einn sannleikur: raunverulegt verknúmer/verklykill og dependency-grunnur.
-- Eldri Verk fá sjálfvirkt verknúmer úr núverandi id svo núverandi tilvísanir haldist stöðugar.

ALTER TABLE "WorkOrder"
  ADD COLUMN "workNumber" TEXT,
  ADD COLUMN "workKey" TEXT,
  ADD COLUMN "externalId" TEXT;

UPDATE "WorkOrder"
SET "workNumber" = "id"::text
WHERE "workNumber" IS NULL;

CREATE UNIQUE INDEX "WorkOrder_companyId_workNumber_key"
  ON "WorkOrder"("companyId", "workNumber");
CREATE INDEX "WorkOrder_companyId_workKey_idx"
  ON "WorkOrder"("companyId", "workKey");
CREATE INDEX "WorkOrder_companyId_externalId_idx"
  ON "WorkOrder"("companyId", "externalId");

CREATE TABLE "WorkPartDependency" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "workOrderId" INTEGER NOT NULL,
  "predecessorPartId" INTEGER NOT NULL,
  "successorPartId" INTEGER NOT NULL,
  "relationType" TEXT NOT NULL DEFAULT 'FINISH_TO_START',
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkPartDependency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkPartDependency_predecessorPartId_successorPartId_key"
  ON "WorkPartDependency"("predecessorPartId", "successorPartId");
CREATE INDEX "WorkPartDependency_companyId_workOrderId_idx"
  ON "WorkPartDependency"("companyId", "workOrderId");
CREATE INDEX "WorkPartDependency_predecessorPartId_idx"
  ON "WorkPartDependency"("predecessorPartId");
CREATE INDEX "WorkPartDependency_successorPartId_idx"
  ON "WorkPartDependency"("successorPartId");

ALTER TABLE "WorkPartDependency"
  ADD CONSTRAINT "WorkPartDependency_predecessorPartId_fkey"
  FOREIGN KEY ("predecessorPartId") REFERENCES "WorkPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkPartDependency"
  ADD CONSTRAINT "WorkPartDependency_successorPartId_fkey"
  FOREIGN KEY ("successorPartId") REFERENCES "WorkPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkPartDependency"
  ADD CONSTRAINT "WorkPartDependency_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
