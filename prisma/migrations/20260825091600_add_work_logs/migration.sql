-- CreateTable
CREATE TABLE "WorkLog" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "workOrderId" INTEGER NOT NULL,
    "userId" INTEGER,
    "workDate" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkLog_companyId_idx" ON "WorkLog"("companyId");

-- CreateIndex
CREATE INDEX "WorkLog_workOrderId_idx" ON "WorkLog"("workOrderId");

-- CreateIndex
CREATE INDEX "WorkLog_userId_idx" ON "WorkLog"("userId");

-- CreateIndex
CREATE INDEX "WorkLog_workDate_idx" ON "WorkLog"("workDate");

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_workOrderId_fkey"
FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;