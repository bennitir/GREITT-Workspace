-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN "merchantName" TEXT;
ALTER TABLE "Receipt" ADD COLUMN "ocrConfidence" REAL;
ALTER TABLE "Receipt" ADD COLUMN "ocrStatus" TEXT;
ALTER TABLE "Receipt" ADD COLUMN "ocrText" TEXT;
