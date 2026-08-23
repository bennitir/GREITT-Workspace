-- AlterTable
ALTER TABLE "Company" ADD COLUMN "activeActivities" TEXT;
ALTER TABLE "Company" ADD COLUMN "activitiesConfirmedAt" DATETIME;
ALTER TABLE "Company" ADD COLUMN "activitiesConfirmedBy" TEXT;
ALTER TABLE "Company" ADD COLUMN "rskCertificatePath" TEXT;
ALTER TABLE "Company" ADD COLUMN "rskDataUpdatedAt" DATETIME;
ALTER TABLE "Company" ADD COLUMN "rskRegisteredActivities" TEXT;
