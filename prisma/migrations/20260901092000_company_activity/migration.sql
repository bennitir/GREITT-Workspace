-- CreateTable
CREATE TABLE "CompanyActivity" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "registeredAtRsk" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "dataSource" TEXT,
    "dataUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyActivity_companyId_idx" ON "CompanyActivity"("companyId");

-- CreateIndex
CREATE INDEX "CompanyActivity_companyId_isActive_idx" ON "CompanyActivity"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "CompanyActivity_companyId_registeredAtRsk_idx" ON "CompanyActivity"("companyId", "registeredAtRsk");

-- AddForeignKey
ALTER TABLE "CompanyActivity" ADD CONSTRAINT "CompanyActivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
