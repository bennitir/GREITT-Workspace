-- Verk 10: sjálfstæð úthlutun á Verkþátt.
-- Fyrsta virk úthlutunargerðin er PERSON, en resourceKind heldur kjarnanum almennum.
-- Úthlutun er soft-removed svo söguleg staðreynd tapist ekki.

CREATE TABLE "WorkPartAssignment" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "workPartId" INTEGER NOT NULL,
    "resourceKind" TEXT NOT NULL DEFAULT 'PERSON',
    "userId" INTEGER,
    "resourceLabel" TEXT,
    "createdById" INTEGER,
    "removedAt" TIMESTAMP(3),
    "removedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkPartAssignment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkPartAssignment_companyId_idx" ON "WorkPartAssignment"("companyId");
CREATE INDEX "WorkPartAssignment_workPartId_removedAt_idx" ON "WorkPartAssignment"("workPartId", "removedAt");
CREATE INDEX "WorkPartAssignment_userId_removedAt_idx" ON "WorkPartAssignment"("userId", "removedAt");
CREATE INDEX "WorkPartAssignment_resourceKind_idx" ON "WorkPartAssignment"("resourceKind");

ALTER TABLE "WorkPartAssignment"
ADD CONSTRAINT "WorkPartAssignment_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkPartAssignment"
ADD CONSTRAINT "WorkPartAssignment_workPartId_fkey"
FOREIGN KEY ("workPartId") REFERENCES "WorkPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkPartAssignment"
ADD CONSTRAINT "WorkPartAssignment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkPartAssignment"
ADD CONSTRAINT "WorkPartAssignment_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkPartAssignment"
ADD CONSTRAINT "WorkPartAssignment_removedById_fkey"
FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
