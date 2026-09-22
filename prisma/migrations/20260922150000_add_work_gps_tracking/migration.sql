CREATE TABLE "WorkTrackSession" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "employeeId" INTEGER NOT NULL,
  "workPartLaborFactId" INTEGER,
  "diaryEntryId" INTEGER,
  "workOrderId" INTEGER,
  "workPartId" INTEGER,
  "workResourceId" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "source" TEXT NOT NULL DEFAULT 'MOBILE_GPS',
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "lastPointAt" TIMESTAMP(3),
  "pointCount" INTEGER NOT NULL DEFAULT 0,
  "totalDistanceM" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "lastLatitude" DOUBLE PRECISION,
  "lastLongitude" DOUBLE PRECISION,
  "lastAccuracyM" DOUBLE PRECISION,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkTrackSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkTrackSession_source_check" CHECK ("source" IN ('MOBILE_GPS')),
  CONSTRAINT "WorkTrackSession_status_check" CHECK ("status" IN ('PENDING', 'TRACKING', 'STOPPED')),
  CONSTRAINT "WorkTrackSession_target_check" CHECK (
    (("workPartLaborFactId" IS NOT NULL)::int + ("diaryEntryId" IS NOT NULL)::int) = 1
  )
);

CREATE TABLE "WorkTrackPoint" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "sessionId" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "accuracyM" DOUBLE PRECISION,
  "altitudeM" DOUBLE PRECISION,
  "headingDeg" DOUBLE PRECISION,
  "speedMps" DOUBLE PRECISION,

  CONSTRAINT "WorkTrackPoint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkTrackPoint_latitude_check" CHECK ("latitude" >= -90 AND "latitude" <= 90),
  CONSTRAINT "WorkTrackPoint_longitude_check" CHECK ("longitude" >= -180 AND "longitude" <= 180),
  CONSTRAINT "WorkTrackPoint_accuracy_check" CHECK ("accuracyM" IS NULL OR "accuracyM" >= 0),
  CONSTRAINT "WorkTrackPoint_heading_check" CHECK ("headingDeg" IS NULL OR ("headingDeg" >= 0 AND "headingDeg" <= 360)),
  CONSTRAINT "WorkTrackPoint_speed_check" CHECK ("speedMps" IS NULL OR "speedMps" >= 0)
);

CREATE UNIQUE INDEX "WorkTrackSession_workPartLaborFactId_key" ON "WorkTrackSession"("workPartLaborFactId");
CREATE UNIQUE INDEX "WorkTrackSession_diaryEntryId_key" ON "WorkTrackSession"("diaryEntryId");
CREATE INDEX "WorkTrackSession_companyId_employeeId_endedAt_idx" ON "WorkTrackSession"("companyId", "employeeId", "endedAt");
CREATE INDEX "WorkTrackSession_companyId_workOrderId_endedAt_idx" ON "WorkTrackSession"("companyId", "workOrderId", "endedAt");
CREATE INDEX "WorkTrackSession_companyId_workPartId_endedAt_idx" ON "WorkTrackSession"("companyId", "workPartId", "endedAt");
CREATE INDEX "WorkTrackSession_companyId_workResourceId_endedAt_idx" ON "WorkTrackSession"("companyId", "workResourceId", "endedAt");
CREATE INDEX "WorkTrackSession_status_startedAt_idx" ON "WorkTrackSession"("status", "startedAt");

CREATE UNIQUE INDEX "WorkTrackPoint_sessionId_sequence_key" ON "WorkTrackPoint"("sessionId", "sequence");
CREATE INDEX "WorkTrackPoint_companyId_recordedAt_idx" ON "WorkTrackPoint"("companyId", "recordedAt");
CREATE INDEX "WorkTrackPoint_sessionId_recordedAt_idx" ON "WorkTrackPoint"("sessionId", "recordedAt");

ALTER TABLE "WorkTrackSession"
  ADD CONSTRAINT "WorkTrackSession_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkTrackSession"
  ADD CONSTRAINT "WorkTrackSession_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkTrackSession"
  ADD CONSTRAINT "WorkTrackSession_workPartLaborFactId_fkey"
  FOREIGN KEY ("workPartLaborFactId") REFERENCES "WorkPartLaborFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkTrackSession"
  ADD CONSTRAINT "WorkTrackSession_diaryEntryId_fkey"
  FOREIGN KEY ("diaryEntryId") REFERENCES "EmployeeWorkDiaryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkTrackPoint"
  ADD CONSTRAINT "WorkTrackPoint_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "WorkTrackSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
