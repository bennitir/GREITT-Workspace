-- CreateTable
CREATE TABLE "AiDetectedDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "merchantName" TEXT,
    "date" DATETIME,
    "receiptNumber" TEXT,
    "totalAmount" REAL,
    "summary" TEXT NOT NULL,
    "receiptId" INTEGER NOT NULL,
    CONSTRAINT "AiDetectedDocument_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiDetectedDocumentEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "account" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "debit" REAL NOT NULL DEFAULT 0,
    "credit" REAL NOT NULL DEFAULT 0,
    "documentId" INTEGER NOT NULL,
    CONSTRAINT "AiDetectedDocumentEntry_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "AiDetectedDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
