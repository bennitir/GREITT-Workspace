-- VSK-hæfi ökutækja er varðveitt á sameiginlegum WorkResource-farartækjum.
-- Staðan er aðeins forsenda fyrir innskattsmati; hún stofnar aldrei innskatt sjálfkrafa.

ALTER TABLE "WorkResource"
  ADD COLUMN "vatEligibilityStatus" TEXT NOT NULL DEFAULT 'UNCONFIRMED',
  ADD COLUMN "vatEligibilityValidFrom" TIMESTAMP(3),
  ADD COLUMN "vatEligibilityConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "vatEligibilityConfirmedById" INTEGER;

ALTER TABLE "WorkResource"
  ADD CONSTRAINT "WorkResource_vatEligibilityStatus_check"
  CHECK ("vatEligibilityStatus" IN ('UNCONFIRMED', 'NO_VAT_DEDUCTION', 'VAT_ELIGIBLE'));

ALTER TABLE "WorkResource"
  ADD CONSTRAINT "WorkResource_vatEligibilityValidFrom_check"
  CHECK ("vatEligibilityStatus" = 'UNCONFIRMED' OR "vatEligibilityValidFrom" IS NOT NULL);

CREATE INDEX "WorkResource_companyId_kind_vatEligibilityStatus_idx"
  ON "WorkResource"("companyId", "kind", "vatEligibilityStatus");

CREATE INDEX "WorkResource_vatEligibilityConfirmedById_idx"
  ON "WorkResource"("vatEligibilityConfirmedById");

ALTER TABLE "WorkResource"
  ADD CONSTRAINT "WorkResource_vatEligibilityConfirmedById_fkey"
  FOREIGN KEY ("vatEligibilityConfirmedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
