-- GLÖGGT inventory core v1.
-- Stock balance is derived from traceable movements; Work material usage may link to a separate movement.

CREATE TABLE "InventoryItem" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "sku" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "sourceLanguage" TEXT NOT NULL DEFAULT 'is',
  "baseUnit" TEXT NOT NULL DEFAULT 'PCS',
  "customUnit" TEXT,
  "isStockTracked" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "minStock" DOUBLE PRECISION,
  "purchaseUnitCost" DOUBLE PRECISION,
  "saleUnitPrice" DOUBLE PRECISION,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryLocation" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'WAREHOUSE',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryMovement" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "itemId" INTEGER NOT NULL,
  "locationId" INTEGER NOT NULL,
  "movementType" TEXT NOT NULL,
  "quantityDelta" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL,
  "unitCost" DOUBLE PRECISION,
  "movementAt" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "workPartId" INTEGER,
  "usageFactId" INTEGER,
  "createdById" INTEGER,
  "voidedAt" TIMESTAMP(3),
  "voidedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkPartUsageFact"
  ADD COLUMN "inventoryItemId" INTEGER,
  ADD COLUMN "inventoryLocationId" INTEGER;

CREATE UNIQUE INDEX "InventoryItem_companyId_sku_key" ON "InventoryItem"("companyId", "sku");
CREATE INDEX "InventoryItem_companyId_isActive_idx" ON "InventoryItem"("companyId", "isActive");
CREATE INDEX "InventoryItem_companyId_name_idx" ON "InventoryItem"("companyId", "name");

CREATE UNIQUE INDEX "InventoryLocation_companyId_code_key" ON "InventoryLocation"("companyId", "code");
CREATE INDEX "InventoryLocation_companyId_isActive_idx" ON "InventoryLocation"("companyId", "isActive");

CREATE UNIQUE INDEX "InventoryMovement_usageFactId_key" ON "InventoryMovement"("usageFactId");
CREATE INDEX "InventoryMovement_companyId_movementAt_idx" ON "InventoryMovement"("companyId", "movementAt");
CREATE INDEX "InventoryMovement_itemId_locationId_voidedAt_idx" ON "InventoryMovement"("itemId", "locationId", "voidedAt");
CREATE INDEX "InventoryMovement_workPartId_idx" ON "InventoryMovement"("workPartId");
CREATE INDEX "InventoryMovement_movementType_idx" ON "InventoryMovement"("movementType");

CREATE INDEX "WorkPartUsageFact_inventoryItemId_idx" ON "WorkPartUsageFact"("inventoryItemId");
CREATE INDEX "WorkPartUsageFact_inventoryLocationId_idx" ON "WorkPartUsageFact"("inventoryLocationId");

ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryLocation" ADD CONSTRAINT "InventoryLocation_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryLocation" ADD CONSTRAINT "InventoryLocation_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_workPartId_fkey"
  FOREIGN KEY ("workPartId") REFERENCES "WorkPart"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_usageFactId_fkey"
  FOREIGN KEY ("usageFactId") REFERENCES "WorkPartUsageFact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_voidedById_fkey"
  FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkPartUsageFact" ADD CONSTRAINT "WorkPartUsageFact_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkPartUsageFact" ADD CONSTRAINT "WorkPartUsageFact_inventoryLocationId_fkey"
  FOREIGN KEY ("inventoryLocationId") REFERENCES "InventoryLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
