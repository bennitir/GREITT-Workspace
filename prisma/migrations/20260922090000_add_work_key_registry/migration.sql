-- Verklyklaskrá fyrirtækis.
-- WorkOrder.workKey / EmployeeWorkDiaryEntry.workKey eru varðveitt sem denormalíserað textagildi fyrir leit og eldri kóða.
-- Ný workKeyId-tenging gefur fastan master-data lykil án þess að brjóta eldri gögn.

CREATE TABLE "WorkKey" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "normalizedCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "externalId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkKey_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkKey"
  ADD CONSTRAINT "WorkKey_source_check"
  CHECK ("source" IN ('MANUAL', 'IMPORTED', 'MIGRATED'));

CREATE UNIQUE INDEX "WorkKey_companyId_normalizedCode_key" ON "WorkKey"("companyId", "normalizedCode");
CREATE INDEX "WorkKey_companyId_isActive_idx" ON "WorkKey"("companyId", "isActive");
CREATE INDEX "WorkKey_companyId_name_idx" ON "WorkKey"("companyId", "name");
CREATE INDEX "WorkKey_companyId_externalId_idx" ON "WorkKey"("companyId", "externalId");
CREATE INDEX "WorkKey_createdById_idx" ON "WorkKey"("createdById");
CREATE INDEX "WorkKey_updatedById_idx" ON "WorkKey"("updatedById");

ALTER TABLE "WorkKey"
  ADD CONSTRAINT "WorkKey_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkKey"
  ADD CONSTRAINT "WorkKey_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkKey"
  ADD CONSTRAINT "WorkKey_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkOrder" ADD COLUMN "workKeyId" INTEGER;
ALTER TABLE "EmployeeWorkDiaryEntry" ADD COLUMN "workKeyId" INTEGER;

-- Byggja master-data skrá úr þeim lyklum sem þegar eru til í Verkum eða Dagbók.
WITH legacy_keys AS (
  SELECT "companyId", trim("workKey") AS code
  FROM "WorkOrder"
  WHERE "workKey" IS NOT NULL AND trim("workKey") <> ''
  UNION ALL
  SELECT "companyId", trim("workKey") AS code
  FROM "EmployeeWorkDiaryEntry"
  WHERE "workKey" IS NOT NULL AND trim("workKey") <> ''
), normalized AS (
  SELECT
    "companyId",
    code,
    lower(regexp_replace(code, '[[:space:]]+', ' ', 'g')) AS normalized_code
  FROM legacy_keys
), unique_keys AS (
  SELECT DISTINCT ON ("companyId", normalized_code)
    "companyId", code, normalized_code
  FROM normalized
  ORDER BY "companyId", normalized_code, code
)
INSERT INTO "WorkKey" (
  "companyId", "code", "normalizedCode", "name", "source", "createdAt", "updatedAt"
)
SELECT
  "companyId", code, normalized_code, code, 'MIGRATED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM unique_keys
ON CONFLICT ("companyId", "normalizedCode") DO NOTHING;

UPDATE "WorkOrder" AS wo
SET "workKeyId" = wk."id"
FROM "WorkKey" AS wk
WHERE wo."workKey" IS NOT NULL
  AND wo."companyId" = wk."companyId"
  AND lower(regexp_replace(trim(wo."workKey"), '[[:space:]]+', ' ', 'g')) = wk."normalizedCode";

UPDATE "EmployeeWorkDiaryEntry" AS de
SET "workKeyId" = wk."id"
FROM "WorkKey" AS wk
WHERE de."workKey" IS NOT NULL
  AND de."companyId" = wk."companyId"
  AND lower(regexp_replace(trim(de."workKey"), '[[:space:]]+', ' ', 'g')) = wk."normalizedCode";

CREATE INDEX "WorkOrder_workKeyId_idx" ON "WorkOrder"("workKeyId");
CREATE INDEX "EmployeeWorkDiaryEntry_workKeyId_idx" ON "EmployeeWorkDiaryEntry"("workKeyId");

ALTER TABLE "WorkOrder"
  ADD CONSTRAINT "WorkOrder_workKeyId_fkey"
  FOREIGN KEY ("workKeyId") REFERENCES "WorkKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeWorkDiaryEntry"
  ADD CONSTRAINT "EmployeeWorkDiaryEntry_workKeyId_fkey"
  FOREIGN KEY ("workKeyId") REFERENCES "WorkKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;
