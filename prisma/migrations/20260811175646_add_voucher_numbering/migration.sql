-- AlterTable
ALTER TABLE "AiDetectedDocument" ADD COLUMN "voucherNumber" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "rskRegisteredActivities" TEXT,
    "activeActivities" TEXT,
    "rskCertificatePath" TEXT,
    "rskDataUpdatedAt" DATETIME,
    "activitiesConfirmedAt" DATETIME,
    "activitiesConfirmedBy" TEXT
);
INSERT INTO "new_Company" ("activeActivities", "activitiesConfirmedAt", "activitiesConfirmedBy", "address", "contact", "email", "id", "kennitala", "name", "phone", "rskCertificatePath", "rskDataUpdatedAt", "rskRegisteredActivities", "vatNumber") SELECT "activeActivities", "activitiesConfirmedAt", "activitiesConfirmedBy", "address", "contact", "email", "id", "kennitala", "name", "phone", "rskCertificatePath", "rskDataUpdatedAt", "rskRegisteredActivities", "vatNumber" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
CREATE UNIQUE INDEX "Company_kennitala_key" ON "Company"("kennitala");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
