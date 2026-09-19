-- Fylgiskjal -> Birgðir: varðveittar vörulínur og rekjanleg vörumóttaka.
-- Línan er fyrst tillaga úr skjalalestri. Engin birgðahreyfing verður til fyrr
-- en notandi staðfestir vöru, magn og lagerstað í yfirferð fylgiskjals.

CREATE TABLE "DocumentInventoryLine" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "documentId" INTEGER NOT NULL,
  "lineIndex" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "normalizedDescription" TEXT NOT NULL,
  "supplierItemCode" TEXT,
  "normalizedSupplierItemCode" TEXT,
  "barcode" TEXT,
  "quantity" DOUBLE PRECISION,
  "unit" TEXT,
  "unitPrice" DOUBLE PRECISION,
  "lineTotal" DOUBLE PRECISION,
  "stockCandidate" BOOLEAN NOT NULL DEFAULT false,
  "extractionSource" TEXT NOT NULL DEFAULT 'AI',
  "extractionConfidence" DOUBLE PRECISION,
  "matchedItemId" INTEGER,
  "matchSource" TEXT,
  "matchConfidence" DOUBLE PRECISION,
  "locationId" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "receivedAt" TIMESTAMP(3),
  "receivedById" INTEGER,
  "skipReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentInventoryLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentInventoryLine_documentId_lineIndex_key"
  ON "DocumentInventoryLine"("documentId", "lineIndex");
CREATE INDEX "DocumentInventoryLine_companyId_status_idx"
  ON "DocumentInventoryLine"("companyId", "status");
CREATE INDEX "DocumentInventoryLine_companyId_barcode_idx"
  ON "DocumentInventoryLine"("companyId", "barcode");
CREATE INDEX "DocumentInventoryLine_companyId_normalizedSupplierItemCode_idx"
  ON "DocumentInventoryLine"("companyId", "normalizedSupplierItemCode");
CREATE INDEX "DocumentInventoryLine_companyId_normalizedDescription_idx"
  ON "DocumentInventoryLine"("companyId", "normalizedDescription");
CREATE INDEX "DocumentInventoryLine_matchedItemId_idx"
  ON "DocumentInventoryLine"("matchedItemId");
CREATE INDEX "DocumentInventoryLine_locationId_idx"
  ON "DocumentInventoryLine"("locationId");

ALTER TABLE "DocumentInventoryLine"
  ADD CONSTRAINT "DocumentInventoryLine_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentInventoryLine"
  ADD CONSTRAINT "DocumentInventoryLine_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "AiDetectedDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentInventoryLine"
  ADD CONSTRAINT "DocumentInventoryLine_matchedItemId_fkey"
  FOREIGN KEY ("matchedItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentInventoryLine"
  ADD CONSTRAINT "DocumentInventoryLine_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DocumentInventoryLine"
  ADD CONSTRAINT "DocumentInventoryLine_receivedById_fkey"
  FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement"
  ADD COLUMN "documentInventoryLineId" INTEGER;

CREATE UNIQUE INDEX "InventoryMovement_documentInventoryLineId_key"
  ON "InventoryMovement"("documentInventoryLineId");
CREATE INDEX "InventoryMovement_documentInventoryLineId_idx"
  ON "InventoryMovement"("documentInventoryLineId");

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_documentInventoryLineId_fkey"
  FOREIGN KEY ("documentInventoryLineId") REFERENCES "DocumentInventoryLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
