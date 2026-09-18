-- Verk 10: raunvinna manns sem sjálfstæð rekstrarstaðreynd á Verkþætti.
-- Úthlutun segir hver á að vinna; þessi tafla segir hvað var raunverulega unnið.
-- Færslur eru ógiltar rekjanlega í stað þess að vera eytt.

CREATE TABLE "WorkPartLaborFact" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "workPartId" INTEGER NOT NULL,
    "userId" INTEGER,
    "resourceLabel" TEXT,
    "workDate" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdById" INTEGER,
    "voidedAt" TIMESTAMP(3),
    "voidedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkPartLaborFact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkPartLaborFact_companyId_idx" ON "WorkPartLaborFact"("companyId");
CREATE INDEX "WorkPartLaborFact_workPartId_voidedAt_idx" ON "WorkPartLaborFact"("workPartId", "voidedAt");
CREATE INDEX "WorkPartLaborFact_userId_workDate_idx" ON "WorkPartLaborFact"("userId", "workDate");
CREATE INDEX "WorkPartLaborFact_workDate_idx" ON "WorkPartLaborFact"("workDate");
CREATE INDEX "WorkPartLaborFact_source_idx" ON "WorkPartLaborFact"("source");

ALTER TABLE "WorkPartLaborFact"
ADD CONSTRAINT "WorkPartLaborFact_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkPartLaborFact"
ADD CONSTRAINT "WorkPartLaborFact_workPartId_fkey"
FOREIGN KEY ("workPartId") REFERENCES "WorkPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkPartLaborFact"
ADD CONSTRAINT "WorkPartLaborFact_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkPartLaborFact"
ADD CONSTRAINT "WorkPartLaborFact_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkPartLaborFact"
ADD CONSTRAINT "WorkPartLaborFact_voidedById_fkey"
FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
