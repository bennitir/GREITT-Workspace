-- CreateTable
CREATE TABLE "WorkPartUsageFact" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "workPartId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MATERIAL',
    "resourceCode" TEXT,
    "resourceLabel" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL DEFAULT 'is',
    "usageDate" TIMESTAMP(3) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "customUnit" TEXT,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdById" INTEGER,
    "voidedAt" TIMESTAMP(3),
    "voidedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkPartUsageFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkPartUsageFact_companyId_idx" ON "WorkPartUsageFact"("companyId");
CREATE INDEX "WorkPartUsageFact_workPartId_voidedAt_idx" ON "WorkPartUsageFact"("workPartId", "voidedAt");
CREATE INDEX "WorkPartUsageFact_usageDate_idx" ON "WorkPartUsageFact"("usageDate");
CREATE INDEX "WorkPartUsageFact_kind_idx" ON "WorkPartUsageFact"("kind");
CREATE INDEX "WorkPartUsageFact_resourceCode_idx" ON "WorkPartUsageFact"("resourceCode");
CREATE INDEX "WorkPartUsageFact_source_idx" ON "WorkPartUsageFact"("source");

-- AddForeignKey
ALTER TABLE "WorkPartUsageFact" ADD CONSTRAINT "WorkPartUsageFact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkPartUsageFact" ADD CONSTRAINT "WorkPartUsageFact_workPartId_fkey" FOREIGN KEY ("workPartId") REFERENCES "WorkPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkPartUsageFact" ADD CONSTRAINT "WorkPartUsageFact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkPartUsageFact" ADD CONSTRAINT "WorkPartUsageFact_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
