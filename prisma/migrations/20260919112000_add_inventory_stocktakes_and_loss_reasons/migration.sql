-- Vörutalning og aföll: varðveita talda stöðu, mismun og ástæðu rekjanlega.
ALTER TABLE "InventoryMovement"
  ADD COLUMN "reasonCode" TEXT,
  ADD COLUMN "stocktakeId" INTEGER;

CREATE TABLE "InventoryStocktake" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "itemId" INTEGER NOT NULL,
  "locationId" INTEGER NOT NULL,
  "countedAt" TIMESTAMP(3) NOT NULL,
  "expectedQuantity" DOUBLE PRECISION NOT NULL,
  "countedQuantity" DOUBLE PRECISION NOT NULL,
  "varianceQuantity" DOUBLE PRECISION NOT NULL,
  "reasonCode" TEXT,
  "note" TEXT,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InventoryStocktake_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryMovement_stocktakeId_key" ON "InventoryMovement"("stocktakeId");
CREATE INDEX "InventoryMovement_reasonCode_idx" ON "InventoryMovement"("reasonCode");
CREATE INDEX "InventoryStocktake_companyId_countedAt_idx" ON "InventoryStocktake"("companyId", "countedAt");
CREATE INDEX "InventoryStocktake_itemId_locationId_countedAt_idx" ON "InventoryStocktake"("itemId", "locationId", "countedAt");
CREATE INDEX "InventoryStocktake_reasonCode_idx" ON "InventoryStocktake"("reasonCode");

ALTER TABLE "InventoryStocktake"
  ADD CONSTRAINT "InventoryStocktake_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryStocktake"
  ADD CONSTRAINT "InventoryStocktake_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryStocktake"
  ADD CONSTRAINT "InventoryStocktake_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryStocktake"
  ADD CONSTRAINT "InventoryStocktake_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_stocktakeId_fkey"
  FOREIGN KEY ("stocktakeId") REFERENCES "InventoryStocktake"("id") ON DELETE SET NULL ON UPDATE CASCADE;
