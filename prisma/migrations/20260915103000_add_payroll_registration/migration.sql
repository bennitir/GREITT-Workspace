ALTER TABLE "Company"
ADD COLUMN "payrollRegistered" BOOLEAN,
ADD COLUMN "payrollRegistrationDate" TIMESTAMP(3),
ADD COLUMN "payrollDataSource" TEXT,
ADD COLUMN "payrollDataUpdatedAt" TIMESTAMP(3),
ADD COLUMN "payrollConfirmedAt" TIMESTAMP(3),
ADD COLUMN "payrollConfirmedBy" TEXT;
