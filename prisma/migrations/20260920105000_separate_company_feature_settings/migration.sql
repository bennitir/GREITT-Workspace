CREATE TABLE "CompanyFeatureSetting" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "settingKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyFeatureSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyFeatureSetting_companyId_settingKey_key"
ON "CompanyFeatureSetting"("companyId", "settingKey");

CREATE INDEX "CompanyFeatureSetting_companyId_idx"
ON "CompanyFeatureSetting"("companyId");

ALTER TABLE "CompanyFeatureSetting"
ADD CONSTRAINT "CompanyFeatureSetting_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Flytjum núverandi fyrirtækisstillingar úr CompanyModule áður en taflan er
-- hreinsuð. CompanyModule á eftir þessa migration aðeins að geyma raunverulegar
-- áskriftareiningar GLÖGGT.
INSERT INTO "CompanyFeatureSetting" (
    "companyId",
    "settingKey",
    "enabled",
    "createdAt",
    "updatedAt"
)
SELECT
    "companyId",
    "moduleId",
    "enabled",
    "createdAt",
    "updatedAt"
FROM "CompanyModule"
WHERE "moduleId" LIKE 'mobile:%'
   OR "moduleId" LIKE 'verk:%'
ON CONFLICT ("companyId", "settingKey") DO UPDATE
SET
    "enabled" = EXCLUDED."enabled",
    "updatedAt" = EXCLUDED."updatedAt";

DELETE FROM "CompanyModule"
WHERE "moduleId" LIKE 'mobile:%'
   OR "moduleId" LIKE 'verk:%';
