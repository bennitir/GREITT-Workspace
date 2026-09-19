-- Birgðastaðsetningar, innri tilfærslur, strikamerki og rekstrarlegar frátektir.
-- Líkamleg staðsetning og viðskiptaleg skuldbinding eru aðskildar víddir.

ALTER TABLE "InventoryItem"
  ADD COLUMN "barcode" TEXT;

ALTER TABLE "InventoryMovement"
  ADD COLUMN "inventoryTransferId" INTEGER,
  ADD COLUMN "transferLeg" TEXT;

CREATE TABLE "InventoryTransfer" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "itemId" INTEGER NOT NULL,
  "fromLocationId" INTEGER NOT NULL,
  "toLocationId" INTEGER NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "unit" TEXT NOT NULL,
  "transferredAt" TIMESTAMP(3) NOT NULL,
  "note" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InventoryTransfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryCommitment" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "itemId" INTEGER NOT NULL,
  "locationId" INTEGER NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "commitmentType" TEXT NOT NULL DEFAULT 'RESERVATION',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
  "sourceRef" TEXT,
  "note" TEXT,
  "createdById" INTEGER,
  "releasedById" INTEGER,
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InventoryCommitment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryItem_companyId_barcode_idx" ON "InventoryItem"("companyId", "barcode");
CREATE INDEX "InventoryMovement_inventoryTransferId_idx" ON "InventoryMovement"("inventoryTransferId");
CREATE INDEX "InventoryTransfer_companyId_transferredAt_idx" ON "InventoryTransfer"("companyId", "transferredAt");
CREATE INDEX "InventoryTransfer_itemId_fromLocationId_transferredAt_idx" ON "InventoryTransfer"("itemId", "fromLocationId", "transferredAt");
CREATE INDEX "InventoryTransfer_itemId_toLocationId_transferredAt_idx" ON "InventoryTransfer"("itemId", "toLocationId", "transferredAt");
CREATE INDEX "InventoryCommitment_companyId_status_idx" ON "InventoryCommitment"("companyId", "status");
CREATE INDEX "InventoryCommitment_itemId_locationId_status_idx" ON "InventoryCommitment"("itemId", "locationId", "status");
CREATE INDEX "InventoryCommitment_sourceType_sourceRef_idx" ON "InventoryCommitment"("sourceType", "sourceRef");

ALTER TABLE "InventoryTransfer"
  ADD CONSTRAINT "InventoryTransfer_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryTransfer"
  ADD CONSTRAINT "InventoryTransfer_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryTransfer"
  ADD CONSTRAINT "InventoryTransfer_fromLocationId_fkey"
  FOREIGN KEY ("fromLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryTransfer"
  ADD CONSTRAINT "InventoryTransfer_toLocationId_fkey"
  FOREIGN KEY ("toLocationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryTransfer"
  ADD CONSTRAINT "InventoryTransfer_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_inventoryTransferId_fkey"
  FOREIGN KEY ("inventoryTransferId") REFERENCES "InventoryTransfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryCommitment"
  ADD CONSTRAINT "InventoryCommitment_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryCommitment"
  ADD CONSTRAINT "InventoryCommitment_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryCommitment"
  ADD CONSTRAINT "InventoryCommitment_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "InventoryLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryCommitment"
  ADD CONSTRAINT "InventoryCommitment_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryCommitment"
  ADD CONSTRAINT "InventoryCommitment_releasedById_fkey"
  FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
