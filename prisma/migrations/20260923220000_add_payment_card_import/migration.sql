CREATE TABLE "PaymentCard" (
  "id" SERIAL NOT NULL,
  "companyId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "issuerName" TEXT,
  "network" TEXT,
  "lastFour" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentCard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentCardTransaction" (
  "id" SERIAL NOT NULL,
  "paymentCardId" INTEGER NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "merchantText" TEXT NOT NULL,
  "merchantCategory" TEXT,
  "foreignAmount" DECIMAL(65,30),
  "currency" TEXT,
  "exchangeRate" DECIMAL(65,30),
  "amount" DECIMAL(65,30) NOT NULL,
  "explanation" TEXT,
  "cardPeriod" TEXT,
  "fingerprint" TEXT,
  "sourceType" TEXT,
  "sourceFileName" TEXT,
  "sourceRawData" TEXT,
  "status" TEXT NOT NULL DEFAULT 'UNRECONCILED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PaymentCardTransaction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ImportBatch" ADD COLUMN "paymentCardId" INTEGER;

CREATE INDEX "PaymentCard_companyId_idx" ON "PaymentCard"("companyId");
CREATE INDEX "PaymentCard_companyId_lastFour_idx" ON "PaymentCard"("companyId", "lastFour");

CREATE UNIQUE INDEX "PaymentCardTransaction_paymentCardId_fingerprint_key"
  ON "PaymentCardTransaction"("paymentCardId", "fingerprint");
CREATE INDEX "PaymentCardTransaction_paymentCardId_date_idx"
  ON "PaymentCardTransaction"("paymentCardId", "date");
CREATE INDEX "PaymentCardTransaction_paymentCardId_status_idx"
  ON "PaymentCardTransaction"("paymentCardId", "status");
CREATE INDEX "PaymentCardTransaction_paymentCardId_cardPeriod_idx"
  ON "PaymentCardTransaction"("paymentCardId", "cardPeriod");

CREATE INDEX "ImportBatch_paymentCardId_idx" ON "ImportBatch"("paymentCardId");

ALTER TABLE "PaymentCard"
  ADD CONSTRAINT "PaymentCard_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentCardTransaction"
  ADD CONSTRAINT "PaymentCardTransaction_paymentCardId_fkey"
  FOREIGN KEY ("paymentCardId") REFERENCES "PaymentCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImportBatch"
  ADD CONSTRAINT "ImportBatch_paymentCardId_fkey"
  FOREIGN KEY ("paymentCardId") REFERENCES "PaymentCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
