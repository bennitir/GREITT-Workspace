CREATE TABLE "CompanyMessage" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "recipientUserId" INTEGER NOT NULL,
  "createdByUserId" INTEGER NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CompanyMessage_companyId_recipientUserId_readAt_createdAt_idx" ON "CompanyMessage"("companyId", "recipientUserId", "readAt", "createdAt");
ALTER TABLE "CompanyMessage" ADD CONSTRAINT "CompanyMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyMessage" ADD CONSTRAINT "CompanyMessage_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyMessage" ADD CONSTRAINT "CompanyMessage_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
