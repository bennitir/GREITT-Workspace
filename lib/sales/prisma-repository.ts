import "server-only";

import {
  Prisma,
  type PrismaClient,
} from "../../app/generated/prisma/client";

import {
  SalesService,
  type CreatePaymentRecordInput,
  type CreateSaleLineRecordInput,
  type CreateSaleRecordInput,
  type PaymentRecord,
  type SalesRepository,
  type SalesTransaction,
  type SaleLineRecord,
  type SaleRecord,
  type SaleTotals,
  type UpdateSaleLineRecordInput,
} from "./service";

function createTransactionAdapter(
  tx: Prisma.TransactionClient,
): SalesTransaction {
  return {
    async getBranch(companyId, branchId) {
      const branch = await tx.salesBranch.findUnique({
        where: { id_companyId: { id: branchId, companyId } },
        select: {
          id: true,
          companyId: true,
          isActive: true,
          operationalLocation: { select: { isActive: true } },
        },
      });

      if (!branch) return null;
      return {
        id: branch.id,
        companyId: branch.companyId,
        isActive: branch.isActive && branch.operationalLocation.isActive,
      };
    },

    async getTerminal(companyId, branchId, terminalId) {
      return tx.salesTerminal.findUnique({
        where: {
          id_branchId_companyId: {
            id: terminalId,
            branchId,
            companyId,
          },
        },
        select: {
          id: true,
          companyId: true,
          branchId: true,
          isActive: true,
        },
      });
    },

    async createSale(input: CreateSaleRecordInput): Promise<SaleRecord> {
      return tx.sale.create({
        data: {
          companyId: input.companyId,
          branchId: input.branchId,
          terminalId: input.terminalId,
          currency: input.currency,
        },
      });
    },

    async getSale(companyId, saleId): Promise<SaleRecord | null> {
      return tx.sale.findUnique({
        where: { id_companyId: { id: saleId, companyId } },
      });
    },

    async updateSaleTotals(
      companyId,
      saleId,
      totals: SaleTotals,
    ): Promise<SaleRecord> {
      return tx.sale.update({
        where: { id_companyId: { id: saleId, companyId } },
        data: totals,
      });
    },

    async updateSaleStatus(
      companyId,
      saleId,
      input,
    ): Promise<SaleRecord> {
      return tx.sale.update({
        where: { id_companyId: { id: saleId, companyId } },
        data: input,
      });
    },

    async nextSaleLinePosition(companyId, saleId) {
      const aggregate = await tx.saleLine.aggregate({
        where: { companyId, saleId },
        _max: { position: true },
      });
      return (aggregate._max.position ?? 0) + 1;
    },

    async getSaleLine(
      companyId,
      saleId,
      lineId,
    ): Promise<SaleLineRecord | null> {
      return tx.saleLine.findFirst({
        where: { id: lineId, companyId, saleId },
      });
    },

    async listSaleLines(companyId, saleId): Promise<SaleLineRecord[]> {
      return tx.saleLine.findMany({
        where: { companyId, saleId },
        orderBy: [{ position: "asc" }, { id: "asc" }],
      });
    },

    async createSaleLine(
      input: CreateSaleLineRecordInput,
    ): Promise<SaleLineRecord> {
      return tx.saleLine.create({ data: input });
    },

    async updateSaleLine(
      companyId,
      saleId,
      lineId,
      input: UpdateSaleLineRecordInput,
    ): Promise<SaleLineRecord> {
      return tx.saleLine.update({
        where: { id: lineId, companyId, saleId },
        data: input,
      });
    },

    async deleteSaleLine(companyId, saleId, lineId) {
      await tx.saleLine.delete({
        where: { id: lineId, companyId, saleId },
      });
    },

    async nextPaymentSequence(companyId, saleId) {
      const aggregate = await tx.payment.aggregate({
        where: { companyId, saleId },
        _max: { sequence: true },
      });
      return (aggregate._max.sequence ?? 0) + 1;
    },

    async createPayment(
      input: CreatePaymentRecordInput,
    ): Promise<PaymentRecord> {
      return tx.payment.create({
        data: {
          ...input,
          exchangeRate: null,
          status: "PENDING",
        },
      });
    },

    async getPayment(
      companyId,
      saleId,
      paymentId,
    ): Promise<PaymentRecord | null> {
      return tx.payment.findFirst({
        where: { id: paymentId, companyId, saleId },
      });
    },

    async updatePaymentStatus(
      companyId,
      saleId,
      paymentId,
      input,
    ): Promise<PaymentRecord> {
      return tx.payment.update({
        where: { id: paymentId, companyId, saleId },
        data: input,
      });
    },
  };
}

export function createPrismaSalesRepository(
  client?: Pick<PrismaClient, "$transaction">,
): SalesRepository {
  return {
    async transaction<T>(
      operation: (tx: SalesTransaction) => Promise<T>,
    ): Promise<T> {
      const db = client ?? (await import("../prisma")).prisma;

      for (let attempt = 0; ; attempt += 1) {
        try {
          return await db.$transaction(
            async (tx) => operation(createTransactionAdapter(tx)),
            {
              isolationLevel:
                Prisma.TransactionIsolationLevel.Serializable,
            },
          );
        } catch (error) {
          if (
            attempt >= 2 ||
            !(error instanceof Prisma.PrismaClientKnownRequestError) ||
            !["P2034", "P2002"].includes(error.code)
          ) {
            throw error;
          }
        }
      }
    },
  };
}

export function createPrismaSalesService(
  client?: Pick<PrismaClient, "$transaction">,
) {
  return new SalesService(createPrismaSalesRepository(client));
}
