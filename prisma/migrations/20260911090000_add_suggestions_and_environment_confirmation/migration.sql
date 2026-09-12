-- Ábendingar + staðfesting á samhengi fylgiskjals.
-- Ath.: environment confirmation er ekki bókunarstaðfesting og á ekki
-- að kalla sjálfkrafa á bókaraminni / AccountingPattern.

ALTER TABLE "AiDetectedDocument"
ADD COLUMN "environmentConfirmedAt" TIMESTAMP(3),
ADD COLUMN "environmentConfirmedById" INTEGER,
ADD COLUMN "environmentConfirmationReason" TEXT;

CREATE TABLE "Suggestion" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER,
    "submittedById" INTEGER NOT NULL,
    "reviewedById" INTEGER,
    "entityType" TEXT,
    "entityId" INTEGER,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Suggestion_companyId_createdAt_idx"
ON "Suggestion"("companyId", "createdAt");

CREATE INDEX "Suggestion_status_createdAt_idx"
ON "Suggestion"("status", "createdAt");

CREATE INDEX "Suggestion_entityType_entityId_idx"
ON "Suggestion"("entityType", "entityId");

CREATE INDEX "Suggestion_submittedById_idx"
ON "Suggestion"("submittedById");

CREATE INDEX "Suggestion_reviewedById_idx"
ON "Suggestion"("reviewedById");

ALTER TABLE "Suggestion"
ADD CONSTRAINT "Suggestion_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Suggestion"
ADD CONSTRAINT "Suggestion_submittedById_fkey"
FOREIGN KEY ("submittedById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Suggestion"
ADD CONSTRAINT "Suggestion_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
