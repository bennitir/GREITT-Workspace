-- Sameiginlegt rekstrarstaðalag og stefnu-/tímaháður ferðatími fyrir Verk/Dagskipulag.
-- Employee.address er áfram persónulegt heimilisfang og er EKKI notað sem rekstrarlegur upphafsstaður.

CREATE TABLE "OperationalLocation" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "zoneCode" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "locationKind" TEXT NOT NULL DEFAULT 'SITE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OperationalLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationalTravelRoute" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "fromLocationId" INTEGER NOT NULL,
    "toLocationId" INTEGER NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "defaultMinutes" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OperationalTravelRoute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationalTravelTimeWindow" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "routeId" INTEGER NOT NULL,
    "dayType" TEXT NOT NULL DEFAULT 'WEEKDAY',
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "travelMinutes" INTEGER NOT NULL,
    "ruleCode" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OperationalTravelTimeWindow_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkTravelPlanLeg" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "workOrderId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "plannedDate" DATE NOT NULL,
    "fromLocationId" INTEGER NOT NULL,
    "toLocationId" INTEGER NOT NULL,
    "departureMinutes" INTEGER NOT NULL,
    "arrivalMinutes" INTEGER NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "estimateSource" TEXT NOT NULL DEFAULT 'MANUAL',
    "trafficRuleCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkTravelPlanLeg_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Employee"
  ADD COLUMN "baseOperationalLocationId" INTEGER;
ALTER TABLE "CompanyDepartment"
  ADD COLUMN "defaultOperationalLocationId" INTEGER;
ALTER TABLE "WorkOrder"
  ADD COLUMN "operationalLocationId" INTEGER;

ALTER TABLE "OperationalLocation"
  ADD CONSTRAINT "OperationalLocation_locationKind_check"
  CHECK ("locationKind" IN ('BASE', 'SITE', 'DEPARTMENT', 'OTHER'));
ALTER TABLE "OperationalTravelRoute"
  ADD CONSTRAINT "OperationalTravelRoute_source_check"
  CHECK ("source" IN ('MANUAL', 'IMPORTED', 'API', 'TEST_PROJECTION'));
ALTER TABLE "OperationalTravelRoute"
  ADD CONSTRAINT "OperationalTravelRoute_distance_check"
  CHECK ("distanceKm" >= 0 AND "defaultMinutes" >= 0);
ALTER TABLE "OperationalTravelRoute"
  ADD CONSTRAINT "OperationalTravelRoute_distinct_locations_check"
  CHECK ("fromLocationId" <> "toLocationId");
ALTER TABLE "OperationalTravelTimeWindow"
  ADD CONSTRAINT "OperationalTravelTimeWindow_dayType_check"
  CHECK ("dayType" IN ('ALL', 'WEEKDAY', 'SATURDAY', 'SUNDAY'));
ALTER TABLE "OperationalTravelTimeWindow"
  ADD CONSTRAINT "OperationalTravelTimeWindow_source_check"
  CHECK ("source" IN ('MANUAL', 'IMPORTED', 'API', 'TEST_PROJECTION'));
ALTER TABLE "OperationalTravelTimeWindow"
  ADD CONSTRAINT "OperationalTravelTimeWindow_minutes_check"
  CHECK (
    "startMinutes" >= 0 AND "startMinutes" < 1440 AND
    "endMinutes" > "startMinutes" AND "endMinutes" <= 1440 AND
    "travelMinutes" >= 0
  );
ALTER TABLE "WorkTravelPlanLeg"
  ADD CONSTRAINT "WorkTravelPlanLeg_status_check"
  CHECK ("status" IN ('PLANNED', 'STARTED', 'COMPLETED', 'CANCELLED'));
ALTER TABLE "WorkTravelPlanLeg"
  ADD CONSTRAINT "WorkTravelPlanLeg_minutes_check"
  CHECK (
    "departureMinutes" >= 0 AND "departureMinutes" < 1440 AND
    "arrivalMinutes" >= "departureMinutes" AND "arrivalMinutes" <= 1440 AND
    "estimatedMinutes" >= 0 AND "distanceKm" >= 0
  );

CREATE UNIQUE INDEX "OperationalLocation_companyId_code_key"
  ON "OperationalLocation"("companyId", "code");
CREATE UNIQUE INDEX "OperationalTravelRoute_companyId_fromLocationId_toLocationId_key"
  ON "OperationalTravelRoute"("companyId", "fromLocationId", "toLocationId");
CREATE UNIQUE INDEX "WorkTravelPlanLeg_workOrderId_employeeId_plannedDate_key"
  ON "WorkTravelPlanLeg"("workOrderId", "employeeId", "plannedDate");

CREATE INDEX "OperationalLocation_companyId_isActive_idx"
  ON "OperationalLocation"("companyId", "isActive");
CREATE INDEX "OperationalLocation_companyId_zoneCode_idx"
  ON "OperationalLocation"("companyId", "zoneCode");
CREATE INDEX "OperationalTravelRoute_companyId_isActive_idx"
  ON "OperationalTravelRoute"("companyId", "isActive");
CREATE INDEX "OperationalTravelRoute_fromLocationId_toLocationId_idx"
  ON "OperationalTravelRoute"("fromLocationId", "toLocationId");
CREATE INDEX "OperationalTravelTimeWindow_companyId_isActive_idx"
  ON "OperationalTravelTimeWindow"("companyId", "isActive");
CREATE INDEX "OperationalTravelTimeWindow_routeId_dayType_startMinutes_endMinutes_idx"
  ON "OperationalTravelTimeWindow"("routeId", "dayType", "startMinutes", "endMinutes");
CREATE INDEX "WorkTravelPlanLeg_companyId_plannedDate_idx"
  ON "WorkTravelPlanLeg"("companyId", "plannedDate");
CREATE INDEX "WorkTravelPlanLeg_employeeId_plannedDate_idx"
  ON "WorkTravelPlanLeg"("employeeId", "plannedDate");
CREATE INDEX "WorkTravelPlanLeg_workOrderId_idx"
  ON "WorkTravelPlanLeg"("workOrderId");
CREATE INDEX "Employee_baseOperationalLocationId_idx"
  ON "Employee"("baseOperationalLocationId");
CREATE INDEX "CompanyDepartment_defaultOperationalLocationId_idx"
  ON "CompanyDepartment"("defaultOperationalLocationId");
CREATE INDEX "WorkOrder_operationalLocationId_idx"
  ON "WorkOrder"("operationalLocationId");

ALTER TABLE "OperationalLocation"
  ADD CONSTRAINT "OperationalLocation_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalTravelRoute"
  ADD CONSTRAINT "OperationalTravelRoute_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalTravelRoute"
  ADD CONSTRAINT "OperationalTravelRoute_fromLocationId_fkey"
  FOREIGN KEY ("fromLocationId") REFERENCES "OperationalLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalTravelRoute"
  ADD CONSTRAINT "OperationalTravelRoute_toLocationId_fkey"
  FOREIGN KEY ("toLocationId") REFERENCES "OperationalLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalTravelTimeWindow"
  ADD CONSTRAINT "OperationalTravelTimeWindow_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationalTravelTimeWindow"
  ADD CONSTRAINT "OperationalTravelTimeWindow_routeId_fkey"
  FOREIGN KEY ("routeId") REFERENCES "OperationalTravelRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkTravelPlanLeg"
  ADD CONSTRAINT "WorkTravelPlanLeg_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkTravelPlanLeg"
  ADD CONSTRAINT "WorkTravelPlanLeg_workOrderId_fkey"
  FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkTravelPlanLeg"
  ADD CONSTRAINT "WorkTravelPlanLeg_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkTravelPlanLeg"
  ADD CONSTRAINT "WorkTravelPlanLeg_fromLocationId_fkey"
  FOREIGN KEY ("fromLocationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkTravelPlanLeg"
  ADD CONSTRAINT "WorkTravelPlanLeg_toLocationId_fkey"
  FOREIGN KEY ("toLocationId") REFERENCES "OperationalLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_baseOperationalLocationId_fkey"
  FOREIGN KEY ("baseOperationalLocationId") REFERENCES "OperationalLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyDepartment"
  ADD CONSTRAINT "CompanyDepartment_defaultOperationalLocationId_fkey"
  FOREIGN KEY ("defaultOperationalLocationId") REFERENCES "OperationalLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrder"
  ADD CONSTRAINT "WorkOrder_operationalLocationId_fkey"
  FOREIGN KEY ("operationalLocationId") REFERENCES "OperationalLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
