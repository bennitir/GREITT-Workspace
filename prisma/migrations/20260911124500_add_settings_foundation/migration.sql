CREATE TABLE "CompanyBookkeepingSettings" (
    "companyId" INTEGER NOT NULL,
    "preparationMode" TEXT NOT NULL DEFAULT 'HYBRID',
    "requireReviewBeforeBooking" BOOLEAN NOT NULL DEFAULT false,
    "requireReconciliationBeforeBooking" BOOLEAN NOT NULL DEFAULT false,
    "requireApprovalBeforeBooking" BOOLEAN NOT NULL DEFAULT false,
    "completionMode" TEXT NOT NULL DEFAULT 'MANUAL_CONFIRMATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyBookkeepingSettings_pkey" PRIMARY KEY ("companyId")
);

CREATE TABLE "UserSettings" (
    "userId" INTEGER NOT NULL,
    "interfaceLanguage" TEXT NOT NULL DEFAULT 'is',
    "aiExplanationLanguage" TEXT NOT NULL DEFAULT 'is',
    "aiSupportLevel" TEXT NOT NULL DEFAULT 'STANDARD',
    "aiExplanationDetail" TEXT NOT NULL DEFAULT 'NORMAL',
    "autoOpenNextDocument" BOOLEAN NOT NULL DEFAULT true,
    "showHelpText" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "UserCompany"
ADD COLUMN "canPrepareBookkeeping" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "canReviewBookkeeping" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canReconcileBookkeeping" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canApproveExpenses" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canBookEntries" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canManageCompanySettings" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "CompanyBookkeepingSettings" ADD CONSTRAINT "CompanyBookkeepingSettings_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
