-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AiUsage" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AiUsage" ("action", "cachedInputTokens", "companyId", "costIsk", "costUsd", "createdAt", "durationMs", "errorMessage", "id", "inputTokens", "model", "outputTokens", "receiptId", "success", "totalTokens", "usdIskRate", "userId") SELECT "action", "cachedInputTokens", "companyId", "costIsk", "costUsd", "createdAt", "durationMs", "errorMessage", "id", "inputTokens", "model", "outputTokens", "receiptId", "success", "totalTokens", "usdIskRate", "userId" FROM "AiUsage";
DROP TABLE "AiUsage";
ALTER TABLE "new_AiUsage" RENAME TO "AiUsage";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
