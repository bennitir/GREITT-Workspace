-- Verkþáttur getur haft sameiginlegar hæfnikröfur sem gilda um alla á Verkþættinum.
ALTER TABLE "WorkPart"
ADD COLUMN "requiredQualificationCodes" TEXT;

-- Mönnunarkröfur lýsa samsetningu teymis, t.d. 1 fagmaður + 2 aðstoðarmenn.
CREATE TABLE "WorkPartStaffingRequirement" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "workPartId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "roleCode" TEXT NOT NULL DEFAULT 'GENERAL',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "requiredQualificationCodes" TEXT,
    "preferredQualificationCodes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkPartStaffingRequirement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkPartStaffingRequirement_workPartId_sequence_key"
ON "WorkPartStaffingRequirement"("workPartId", "sequence");

CREATE INDEX "WorkPartStaffingRequirement_companyId_idx"
ON "WorkPartStaffingRequirement"("companyId");

CREATE INDEX "WorkPartStaffingRequirement_workPartId_idx"
ON "WorkPartStaffingRequirement"("workPartId");

CREATE INDEX "WorkPartStaffingRequirement_roleCode_idx"
ON "WorkPartStaffingRequirement"("roleCode");

ALTER TABLE "WorkPartStaffingRequirement"
ADD CONSTRAINT "WorkPartStaffingRequirement_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkPartStaffingRequirement"
ADD CONSTRAINT "WorkPartStaffingRequirement_workPartId_fkey"
FOREIGN KEY ("workPartId") REFERENCES "WorkPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
