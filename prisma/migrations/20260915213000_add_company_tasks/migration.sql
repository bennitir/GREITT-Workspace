CREATE TABLE "CompanyTask" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "taskType" TEXT NOT NULL DEFAULT 'GENERAL',
    "title" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "dueAt" TIMESTAMP(3),
    "assigneeUserId" INTEGER,
    "createdByUserId" INTEGER,
    "completedByUserId" INTEGER,
    "completedAt" TIMESTAMP(3),
    "sourceType" TEXT,
    "sourceId" TEXT,
    "actionPath" TEXT,
    "externalUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CompanyTask_companyId_status_dueAt_idx" ON "CompanyTask"("companyId", "status", "dueAt");
CREATE INDEX "CompanyTask_assigneeUserId_status_dueAt_idx" ON "CompanyTask"("assigneeUserId", "status", "dueAt");
CREATE INDEX "CompanyTask_sourceType_sourceId_idx" ON "CompanyTask"("sourceType", "sourceId");
ALTER TABLE "CompanyTask" ADD CONSTRAINT "CompanyTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyTask" ADD CONSTRAINT "CompanyTask_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyTask" ADD CONSTRAINT "CompanyTask_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyTask" ADD CONSTRAINT "CompanyTask_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
