-- CreateEnum
CREATE TYPE "SalesTerminalType" AS ENUM ('POS', 'MOBILE', 'WEB', 'OTHER');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('DRAFT', 'HELD', 'FINALIZED', 'CANCELLED', 'RETURNED');

-- CreateEnum
CREATE TYPE "SaleLineSource" AS ENUM ('QUICK_BUTTON', 'BARCODE', 'SEARCH', 'FREE_LINE', 'WORK', 'QUOTE', 'ORDER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CONFIRMED', 'FAILED', 'CANCELLED', 'REFUNDED');

-- AlterTable
ALTER TABLE "UserCompany" ADD COLUMN     "canSaleChangePrice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canSaleCustomerManage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canSaleDiscount" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canSaleHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canSaleInvoice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canSaleRefund" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canSaleSettingsManage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canSaleSettlementCreate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canSaleSettlementFinalize" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canSaleSettlementView" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canSaleUse" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canSaleVoid" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CompanyGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyGroupMembership" (
    "id" SERIAL NOT NULL,
    "groupId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyGroupMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesBranch" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "operationalLocationId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesTerminal" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "terminalType" "SalesTerminalType" NOT NULL DEFAULT 'POS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesTerminal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "terminalId" INTEGER,
    "status" "SaleStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'ISK',
    "subtotalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "heldAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleLine" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "saleId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "subtotalAmount" DECIMAL(65,30) NOT NULL,
    "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(65,30) NOT NULL,
    "vatRate" DECIMAL(65,30) NOT NULL,
    "vatAmount" DECIMAL(65,30) NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "source" "SaleLineSource" NOT NULL,
    "sourceReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "saleId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "methodCode" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ISK',
    "exchangeRate" DECIMAL(65,30),
    "reference" TEXT,
    "authorizationReference" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyGroupMembership_companyId_idx" ON "CompanyGroupMembership"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyGroupMembership_groupId_companyId_key" ON "CompanyGroupMembership"("groupId", "companyId");

-- CreateIndex
CREATE INDEX "SalesBranch_companyId_isActive_idx" ON "SalesBranch"("companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SalesBranch_id_companyId_key" ON "SalesBranch"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesBranch_operationalLocationId_companyId_key" ON "SalesBranch"("operationalLocationId", "companyId");

-- CreateIndex
CREATE INDEX "SalesTerminal_companyId_isActive_idx" ON "SalesTerminal"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "SalesTerminal_branchId_isActive_idx" ON "SalesTerminal"("branchId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SalesTerminal_companyId_code_key" ON "SalesTerminal"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "SalesTerminal_id_branchId_companyId_key" ON "SalesTerminal"("id", "branchId", "companyId");

-- CreateIndex
CREATE INDEX "Sale_companyId_status_createdAt_idx" ON "Sale"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_branchId_status_createdAt_idx" ON "Sale"("branchId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Sale_terminalId_status_createdAt_idx" ON "Sale"("terminalId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_id_companyId_key" ON "Sale"("id", "companyId");

-- CreateIndex
CREATE INDEX "SaleLine_companyId_saleId_idx" ON "SaleLine"("companyId", "saleId");

-- CreateIndex
CREATE INDEX "SaleLine_companyId_source_idx" ON "SaleLine"("companyId", "source");

-- CreateIndex
CREATE UNIQUE INDEX "SaleLine_saleId_position_key" ON "SaleLine"("saleId", "position");

-- CreateIndex
CREATE INDEX "Payment_companyId_status_createdAt_idx" ON "Payment"("companyId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_saleId_status_idx" ON "Payment"("saleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_saleId_sequence_key" ON "Payment"("saleId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalLocation_id_companyId_key" ON "OperationalLocation"("id", "companyId");

-- AddForeignKey
ALTER TABLE "CompanyGroupMembership" ADD CONSTRAINT "CompanyGroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CompanyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyGroupMembership" ADD CONSTRAINT "CompanyGroupMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesBranch" ADD CONSTRAINT "SalesBranch_operationalLocationId_companyId_fkey" FOREIGN KEY ("operationalLocationId", "companyId") REFERENCES "OperationalLocation"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesTerminal" ADD CONSTRAINT "SalesTerminal_branchId_companyId_fkey" FOREIGN KEY ("branchId", "companyId") REFERENCES "SalesBranch"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_branchId_companyId_fkey" FOREIGN KEY ("branchId", "companyId") REFERENCES "SalesBranch"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_terminalId_branchId_companyId_fkey" FOREIGN KEY ("terminalId", "branchId", "companyId") REFERENCES "SalesTerminal"("id", "branchId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_saleId_companyId_fkey" FOREIGN KEY ("saleId", "companyId") REFERENCES "Sale"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleId_companyId_fkey" FOREIGN KEY ("saleId", "companyId") REFERENCES "Sale"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
