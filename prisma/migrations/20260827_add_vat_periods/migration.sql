-- CreateTable
CREATE TABLE "VatPeriod" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VatPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VatSubmission" (
    "id" SERIAL NOT NULL,
    "vatPeriodId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "submissionType" TEXT NOT NULL DEFAULT 'ORIGINAL',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "a" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "b" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "c" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "e" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "f" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "g" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "h" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "rskReference" TEXT,
    "rskReceiptPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VatSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VatPeriod_companyId_year_period_idx" ON "VatPeriod"("companyId", "year", "period");

-- CreateIndex
CREATE UNIQUE INDEX "VatPeriod_companyId_year_period_key" ON "VatPeriod"("companyId", "year", "period");

-- CreateIndex
CREATE INDEX "VatSubmission_vatPeriodId_idx" ON "VatSubmission"("vatPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "VatSubmission_vatPeriodId_version_key" ON "VatSubmission"("vatPeriodId", "version");

-- AddForeignKey
ALTER TABLE "VatPeriod" ADD CONSTRAINT "VatPeriod_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VatSubmission" ADD CONSTRAINT "VatSubmission_vatPeriodId_fkey" FOREIGN KEY ("vatPeriodId") REFERENCES "VatPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VatSubmission" ADD CONSTRAINT "VatSubmission_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
