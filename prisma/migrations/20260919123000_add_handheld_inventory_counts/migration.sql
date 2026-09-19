-- Vörutalning í handtölvu.
-- Talningarmaður skráir aðeins raunverulega talda stöðu. Kerfisstaða og mismunur
-- eru ekki sýnd í talningarflæðinu og engin birgðaleiðrétting myndast fyrr en
-- ábyrgðarmaður hefur yfirfarið lotuna.

CREATE TABLE "InventoryCountSession" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "locationId" INTEGER NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'HANDHELD',
  "status" TEXT NOT NULL DEFAULT 'COUNTING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "note" TEXT,
  "createdById" INTEGER,
  "reviewedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryCountSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryCountLine" (
  "id" SERIAL NOT NULL,
  "sessionId" INTEGER NOT NULL,
  "companyId" INTEGER NOT NULL,
  "itemId" INTEGER NOT NULL,
  "skuSnapshot" TEXT NOT NULL,
  "barcodeSnapshot" TEXT,
  "nameSnapshot" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "countedQuantity" DOUBLE PRECISION NOT NULL,
  "countedAt" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'COUNTED',
  "stocktakeId" INTEGER,
  "countedById" INTEGER,
  "voidedAt" TIMESTAMP(3),
  "voidedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryCountLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryCountSession_companyId_status_createdAt_idx"
  ON "InventoryCountSession"("companyId", "status", "createdAt");
CREATE INDEX "InventoryCountSession_locationId_status_idx"
  ON "InventoryCountSession"("locationId", "status");
CREATE INDEX "InventoryCountSession_createdById_status_idx"
  ON "InventoryCountSession"("createdById", "status");

CREATE UNIQUE INDEX "InventoryCountLine_sessionId_itemId_key"
  ON "InventoryCountLine"("sessionId", "itemId");
CREATE INDEX "InventoryCountLine_companyId_countedAt_idx"
  ON "InventoryCountLine"("companyId", "countedAt");
CREATE INDEX "InventoryCountLine_itemId_countedAt_idx"
  ON "InventoryCountLine"("itemId", "countedAt");
CREATE INDEX "InventoryCountLine_status_idx"
  ON "InventoryCountLine"("status");
CREATE INDEX "InventoryCountLine_stocktakeId_idx"
  ON "InventoryCountLine"("stocktakeId");

ALTER TABLE "InventoryCountSession"
  ADD CONSTRAINT "InventoryCountSession_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCountSession"
  ADD CONSTRAINT "InventoryCountSession_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCountSession"
  ADD CONSTRAINT "InventoryCountSession_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryCountSession"
  ADD CONSTRAINT "InventoryCountSession_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryCountLine"
  ADD CONSTRAINT "InventoryCountLine_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "InventoryCountSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCountLine"
  ADD CONSTRAINT "InventoryCountLine_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryCountLine"
  ADD CONSTRAINT "InventoryCountLine_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryCountLine"
  ADD CONSTRAINT "InventoryCountLine_countedById_fkey"
  FOREIGN KEY ("countedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryCountLine"
  ADD CONSTRAINT "InventoryCountLine_voidedById_fkey"
  FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
