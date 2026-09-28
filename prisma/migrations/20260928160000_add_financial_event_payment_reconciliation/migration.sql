-- Rekjanleg pörun bankagreiðslna við fjárhagsatburði og valfrjálsa gjalddaga.
-- Engin fyrirliggjandi FinancialEvent/BankTransaction gögn eru uppfærð í þessari migration.

CREATE TABLE "FinancialEventPayment" (
    "id" SERIAL NOT NULL,
    "eventId" INTEGER NOT NULL,
    "bankTransactionId" INTEGER NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ISK',
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "matchType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'SYSTEM',
    "confirmedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinancialEventPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancialEventPaymentAllocation" (
    "id" SERIAL NOT NULL,
    "paymentId" INTEGER NOT NULL,
    "scheduleItemId" INTEGER NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "matchType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'SYSTEM',
    "confirmedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FinancialEventPaymentAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancialEventPayment_eventId_bankTransactionId_key"
ON "FinancialEventPayment"("eventId", "bankTransactionId");

CREATE INDEX "FinancialEventPayment_bankTransactionId_status_idx"
ON "FinancialEventPayment"("bankTransactionId", "status");

CREATE INDEX "FinancialEventPayment_eventId_status_idx"
ON "FinancialEventPayment"("eventId", "status");

CREATE UNIQUE INDEX "FinancialEventPaymentAllocation_paymentId_scheduleItemId_key"
ON "FinancialEventPaymentAllocation"("paymentId", "scheduleItemId");

CREATE INDEX "FinancialEventPaymentAllocation_scheduleItemId_status_idx"
ON "FinancialEventPaymentAllocation"("scheduleItemId", "status");

CREATE INDEX "FinancialEventPaymentAllocation_paymentId_status_idx"
ON "FinancialEventPaymentAllocation"("paymentId", "status");

ALTER TABLE "FinancialEventPayment"
ADD CONSTRAINT "FinancialEventPayment_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "FinancialEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialEventPayment"
ADD CONSTRAINT "FinancialEventPayment_bankTransactionId_fkey"
FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialEventPaymentAllocation"
ADD CONSTRAINT "FinancialEventPaymentAllocation_paymentId_fkey"
FOREIGN KEY ("paymentId") REFERENCES "FinancialEventPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinancialEventPaymentAllocation"
ADD CONSTRAINT "FinancialEventPaymentAllocation_scheduleItemId_fkey"
FOREIGN KEY ("scheduleItemId") REFERENCES "FinancialEventScheduleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
