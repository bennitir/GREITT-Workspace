-- AlterTable
ALTER TABLE "AiDetectedDocument" ADD COLUMN "duplicateMarkedAt" DATETIME;
ALTER TABLE "AiDetectedDocument" ADD COLUMN "duplicateOfDocumentId" INTEGER;
ALTER TABLE "AiDetectedDocument" ADD COLUMN "duplicateVoucherNumber" INTEGER;
ALTER TABLE "AiDetectedDocument" ADD COLUMN "merchantKennitala" TEXT;
ALTER TABLE "AiDetectedDocument" ADD COLUMN "pageNumber" INTEGER;
ALTER TABLE "AiDetectedDocument" ADD COLUMN "reviewedAt" DATETIME;

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER,
    "userId" INTEGER,
    "receiptId" INTEGER,
    "action" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "costIsk" REAL NOT NULL DEFAULT 0,
    "usdIskRate" REAL NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CLIENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserCompany" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "entryRole" TEXT NOT NULL DEFAULT 'GENERAL',
    "vatRate" INTEGER,
    "vatAccount" TEXT,
    "vatRequiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "companyId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("companyId", "createdAt", "id", "isActive", "name", "number", "type", "updatedAt") SELECT "companyId", "createdAt", "id", "isActive", "name", "number", "type", "updatedAt" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE UNIQUE INDEX "Account_companyId_number_key" ON "Account"("companyId" ASC, "number" ASC);
CREATE TABLE "new_Company" (
    "nextVoucherNumber" INTEGER NOT NULL DEFAULT 1,
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "kennitala" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "vatNumber" TEXT,
    "receiptEntryMode" TEXT NOT NULL DEFAULT 'AI',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rskRegisteredActivities" TEXT,
    "activeActivities" TEXT,
    "rskCertificatePath" TEXT,
    "rskDataUpdatedAt" DATETIME,
    "activitiesConfirmedAt" DATETIME,
    "activitiesConfirmedBy" TEXT,
    "closedAt" DATETIME
);
INSERT INTO "new_Company" ("activeActivities", "activitiesConfirmedAt", "activitiesConfirmedBy", "address", "contact", "email", "id", "kennitala", "name", "nextVoucherNumber", "phone", "rskCertificatePath", "rskDataUpdatedAt", "rskRegisteredActivities", "vatNumber") SELECT "activeActivities", "activitiesConfirmedAt", "activitiesConfirmedBy", "address", "contact", "email", "id", "kennitala", "name", "nextVoucherNumber", "phone", "rskCertificatePath", "rskDataUpdatedAt", "rskRegisteredActivities", "vatNumber" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
CREATE UNIQUE INDEX "Company_kennitala_key" ON "Company"("kennitala" ASC);
CREATE TABLE "new_Receipt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "fileName" TEXT,
    "filePath" TEXT,
    "fileHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "receiptNumber" TEXT,
    "voucherNumber" INTEGER,
    "merchantName" TEXT,
    "merchantKennitala" TEXT,
    "ocrText" TEXT,
    "ocrConfidence" REAL,
    "ocrStatus" TEXT,
    "aiDate" DATETIME,
    "aiAmount" REAL,
    "aiApprovedAt" DATETIME,
    "documentCount" INTEGER,
    "suggestedDebitAccount" TEXT,
    "suggestedCreditAccount" TEXT,
    "suggestedBookingText" TEXT,
    "companyId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Receipt" ("aiAmount", "aiApprovedAt", "aiDate", "amount", "companyId", "createdAt", "date", "description", "documentCount", "fileName", "filePath", "id", "merchantName", "ocrConfidence", "ocrStatus", "ocrText", "receiptNumber", "status", "suggestedBookingText", "suggestedCreditAccount", "suggestedDebitAccount", "updatedAt") SELECT "aiAmount", "aiApprovedAt", "aiDate", "amount", "companyId", "createdAt", "date", "description", "documentCount", "fileName", "filePath", "id", "merchantName", "ocrConfidence", "ocrStatus", "ocrText", "receiptNumber", "status", "suggestedBookingText", "suggestedCreditAccount", "suggestedDebitAccount", "updatedAt" FROM "Receipt";
DROP TABLE "Receipt";
ALTER TABLE "new_Receipt" RENAME TO "Receipt";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "UserCompany_userId_companyId_key" ON "UserCompany"("userId" ASC, "companyId" ASC);


