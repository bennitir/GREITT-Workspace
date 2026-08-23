-- A single company may never reserve the same voucher number twice.
CREATE TABLE "VoucherNumberReservation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "voucherNumber" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "VoucherNumberReservation_companyId_voucherNumber_key"
ON "VoucherNumberReservation"("companyId", "voucherNumber");

CREATE INDEX "VoucherNumberReservation_companyId_idx"
ON "VoucherNumberReservation"("companyId");

-- Seed reservations from already-booked AI documents.
INSERT OR IGNORE INTO "VoucherNumberReservation" ("companyId", "voucherNumber", "sourceType", "sourceId")
SELECT r."companyId", d."voucherNumber", 'AI_DOCUMENT', d."id"
FROM "AiDetectedDocument" d
JOIN "Receipt" r ON r."id" = d."receiptId"
WHERE d."voucherNumber" IS NOT NULL;

