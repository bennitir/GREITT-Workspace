CREATE TABLE "UserCompanyMobileFeature" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "featureKey" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCompanyMobileFeature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserCompanyMobileFeature_companyId_userId_featureKey_key"
ON "UserCompanyMobileFeature"("companyId", "userId", "featureKey");

CREATE INDEX "UserCompanyMobileFeature_companyId_userId_idx"
ON "UserCompanyMobileFeature"("companyId", "userId");

CREATE INDEX "UserCompanyMobileFeature_userId_idx"
ON "UserCompanyMobileFeature"("userId");

ALTER TABLE "UserCompanyMobileFeature"
ADD CONSTRAINT "UserCompanyMobileFeature_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserCompanyMobileFeature"
ADD CONSTRAINT "UserCompanyMobileFeature_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
