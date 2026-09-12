ALTER TABLE "UserSettings"
ADD COLUMN "timeTrackingMode" TEXT NOT NULL DEFAULT 'OFF',
ADD COLUMN "timeTrackingIdleMinutes" INTEGER NOT NULL DEFAULT 10;

CREATE TABLE "ServiceTimeEntry" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "category" TEXT NOT NULL DEFAULT 'ANNAÐ',
  "description" TEXT,
  "module" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceTimeEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServiceTimeEntry_companyId_userId_startedAt_idx" ON "ServiceTimeEntry"("companyId", "userId", "startedAt");
ALTER TABLE "ServiceTimeEntry" ADD CONSTRAINT "ServiceTimeEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceTimeEntry" ADD CONSTRAINT "ServiceTimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
