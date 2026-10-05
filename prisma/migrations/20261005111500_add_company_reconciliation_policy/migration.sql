-- Explicit company context for FinancialReconciliation coverage.
-- Existing companies stay UNCONFIRMED/INFORMATIONAL until a user confirms the profile.
ALTER TABLE "Company"
  ADD COLUMN "taxIdentityType" TEXT NOT NULL DEFAULT 'UNCONFIRMED',
  ADD COLUMN "personalBusinessUse" TEXT NOT NULL DEFAULT 'UNCONFIRMED',
  ADD COLUMN "reconciliationCoverageOverride" TEXT;
