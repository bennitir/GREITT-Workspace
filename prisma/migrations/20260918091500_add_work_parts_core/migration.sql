-- Verk 10 – fyrsti varanlegi domain-hlutinn: Verkþáttur.
-- Núverandi WorkOrder/WorkLog gögn haldast óbreytt.

CREATE TABLE "WorkPart" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "workOrderId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "sourceLanguage" TEXT NOT NULL DEFAULT 'is',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdById" INTEGER,
    "updatedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkPart_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkPartTranslation" (
    "id" SERIAL NOT NULL,
    "workPartId" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "source" TEXT NOT NULL DEFAULT 'HUMAN',
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkPartTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkPart_workOrderId_sequence_key" ON "WorkPart"("workOrderId", "sequence");
CREATE INDEX "WorkPart_companyId_idx" ON "WorkPart"("companyId");
CREATE INDEX "WorkPart_workOrderId_idx" ON "WorkPart"("workOrderId");
CREATE INDEX "WorkPart_status_idx" ON "WorkPart"("status");

CREATE UNIQUE INDEX "WorkPartTranslation_workPartId_language_key" ON "WorkPartTranslation"("workPartId", "language");
CREATE INDEX "WorkPartTranslation_workPartId_idx" ON "WorkPartTranslation"("workPartId");
CREATE INDEX "WorkPartTranslation_language_idx" ON "WorkPartTranslation"("language");

ALTER TABLE "WorkPart"
ADD CONSTRAINT "WorkPart_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkPart"
ADD CONSTRAINT "WorkPart_workOrderId_fkey"
FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkPart"
ADD CONSTRAINT "WorkPart_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkPart"
ADD CONSTRAINT "WorkPart_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkPartTranslation"
ADD CONSTRAINT "WorkPartTranslation_workPartId_fkey"
FOREIGN KEY ("workPartId") REFERENCES "WorkPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkPartTranslation"
ADD CONSTRAINT "WorkPartTranslation_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
