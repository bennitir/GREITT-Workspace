-- Verk 10: varanlegar þýðingar á starfsmannasýnilegu vinnuefni.
-- Frumtexti Verks, Verkþáttar og raunvinnuathugasemda er varðveittur óbreyttur.

ALTER TABLE "WorkOrder"
ADD COLUMN "sourceLanguage" TEXT NOT NULL DEFAULT 'is';

CREATE TABLE "WorkOrderTranslation" (
    "id" SERIAL NOT NULL,
    "workOrderId" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "source" TEXT NOT NULL DEFAULT 'HUMAN',
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrderTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkOrderTranslation_workOrderId_language_key"
ON "WorkOrderTranslation"("workOrderId", "language");

CREATE INDEX "WorkOrderTranslation_workOrderId_idx"
ON "WorkOrderTranslation"("workOrderId");

CREATE INDEX "WorkOrderTranslation_language_idx"
ON "WorkOrderTranslation"("language");

ALTER TABLE "WorkOrderTranslation"
ADD CONSTRAINT "WorkOrderTranslation_workOrderId_fkey"
FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkOrderTranslation"
ADD CONSTRAINT "WorkOrderTranslation_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkPartLaborFact"
ADD COLUMN "noteSourceLanguage" TEXT NOT NULL DEFAULT 'is';

CREATE TABLE "WorkPartLaborFactTranslation" (
    "id" SERIAL NOT NULL,
    "laborFactId" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'HUMAN',
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkPartLaborFactTranslation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkPartLaborFactTranslation_laborFactId_language_key"
ON "WorkPartLaborFactTranslation"("laborFactId", "language");

CREATE INDEX "WorkPartLaborFactTranslation_laborFactId_idx"
ON "WorkPartLaborFactTranslation"("laborFactId");

CREATE INDEX "WorkPartLaborFactTranslation_language_idx"
ON "WorkPartLaborFactTranslation"("language");

ALTER TABLE "WorkPartLaborFactTranslation"
ADD CONSTRAINT "WorkPartLaborFactTranslation_laborFactId_fkey"
FOREIGN KEY ("laborFactId") REFERENCES "WorkPartLaborFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkPartLaborFactTranslation"
ADD CONSTRAINT "WorkPartLaborFactTranslation_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
