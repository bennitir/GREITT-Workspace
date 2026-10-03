import {
  PAYMENT_STATUSES,
  assertPaymentStatusTransition,
  assertSaleStatusTransition,
  calculateSaleTotals,
  decimalCompare,
  isPositivePaymentAmount,
  validateSaleLineAmounts,
  type ExactDecimalInput,
  type PaymentStatus,
  type SaleLineAmounts,
  type SaleStatus,
  type SaleTotals as DomainSaleTotals,
} from "@/lib/core/sales-domain";

export type { SaleTotals } from "@/lib/core/sales-domain";

export const SALE_LINE_SOURCES = [
  "QUICK_BUTTON",
  "BARCODE",
  "SEARCH",
  "FREE_LINE",
  "WORK",
  "QUOTE",
  "ORDER",
] as const;

export type SaleLineSource = (typeof SALE_LINE_SOURCES)[number];

export type SalesBranchRecord = {
  id: number;
  companyId: number;
  isActive: boolean;
};

export type SalesTerminalRecord = {
  id: number;
  companyId: number;
  branchId: number;
  isActive: boolean;
};

export type SaleRecord = {
  id: number;
  companyId: number;
  branchId: number;
  terminalId: number | null;
  status: SaleStatus;
  currency: string;
  subtotalAmount: ExactDecimalInput;
  discountAmount: ExactDecimalInput;
  netAmount: ExactDecimalInput;
  vatAmount: ExactDecimalInput;
  totalAmount: ExactDecimalInput;
  heldAt: Date | null;
  finalizedAt: Date | null;
  cancelledAt: Date | null;
  returnedAt: Date | null;
};

export type SaleLineRecord = {
  id: number;
  companyId: number;
  saleId: number;
  position: number;
  description: string;
  quantity: ExactDecimalInput;
  unit: string;
  unitPrice: ExactDecimalInput;
  subtotalAmount: ExactDecimalInput;
  discountAmount: ExactDecimalInput;
  netAmount: ExactDecimalInput;
  vatRate: ExactDecimalInput;
  vatAmount: ExactDecimalInput;
  totalAmount: ExactDecimalInput;
  source: SaleLineSource;
  sourceReference: string | null;
};

export type PaymentRecord = {
  id: number;
  companyId: number;
  saleId: number;
  sequence: number;
  methodCode: string;
  amount: ExactDecimalInput;
  currency: string;
  exchangeRate: ExactDecimalInput | null;
  reference: string | null;
  authorizationReference: string | null;
  status: PaymentStatus;
  confirmedAt: Date | null;
};

export type CreateSaleRecordInput = {
  companyId: number;
  branchId: number;
  terminalId: number | null;
  currency: string;
};

export type CreateSaleLineRecordInput = {
  companyId: number;
  saleId: number;
  position: number;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  subtotalAmount: string;
  discountAmount: string;
  netAmount: string;
  vatRate: string;
  vatAmount: string;
  totalAmount: string;
  source: SaleLineSource;
  sourceReference: string | null;
};

export type UpdateSaleLineRecordInput = Omit<
  CreateSaleLineRecordInput,
  "companyId" | "saleId" | "position"
>;

export type CreatePaymentRecordInput = {
  companyId: number;
  saleId: number;
  sequence: number;
  methodCode: string;
  amount: string;
  currency: string;
  reference: string | null;
  authorizationReference: string | null;
};

export interface SalesTransaction {
  getBranch(companyId: number, branchId: number): Promise<SalesBranchRecord | null>;
  getTerminal(
    companyId: number,
    branchId: number,
    terminalId: number,
  ): Promise<SalesTerminalRecord | null>;
  createSale(input: CreateSaleRecordInput): Promise<SaleRecord>;
  getSale(companyId: number, saleId: number): Promise<SaleRecord | null>;
  updateSaleTotals(
    companyId: number,
    saleId: number,
    totals: DomainSaleTotals,
  ): Promise<SaleRecord>;
  updateSaleStatus(
    companyId: number,
    saleId: number,
    input: {
      status: SaleStatus;
      heldAt?: Date | null;
      finalizedAt?: Date | null;
    },
  ): Promise<SaleRecord>;

  nextSaleLinePosition(companyId: number, saleId: number): Promise<number>;
  getSaleLine(
    companyId: number,
    saleId: number,
    lineId: number,
  ): Promise<SaleLineRecord | null>;
  listSaleLines(companyId: number, saleId: number): Promise<SaleLineRecord[]>;
  createSaleLine(input: CreateSaleLineRecordInput): Promise<SaleLineRecord>;
  updateSaleLine(
    companyId: number,
    saleId: number,
    lineId: number,
    input: UpdateSaleLineRecordInput,
  ): Promise<SaleLineRecord>;
  deleteSaleLine(
    companyId: number,
    saleId: number,
    lineId: number,
  ): Promise<void>;

  nextPaymentSequence(companyId: number, saleId: number): Promise<number>;
  createPayment(input: CreatePaymentRecordInput): Promise<PaymentRecord>;
  getPayment(
    companyId: number,
    saleId: number,
    paymentId: number,
  ): Promise<PaymentRecord | null>;
  updatePaymentStatus(
    companyId: number,
    saleId: number,
    paymentId: number,
    input: { status: PaymentStatus; confirmedAt?: Date | null },
  ): Promise<PaymentRecord>;
}

export interface SalesRepository {
  transaction<T>(operation: (tx: SalesTransaction) => Promise<T>): Promise<T>;
}

export type SaleSnapshot = {
  id: number;
  companyId: number;
  branchId: number;
  terminalId: number | null;
  status: SaleStatus;
  currency: string;
  subtotalAmount: string;
  discountAmount: string;
  netAmount: string;
  vatAmount: string;
  totalAmount: string;
  heldAt: Date | null;
  finalizedAt: Date | null;
};

export type PaymentSnapshot = {
  id: number;
  saleId: number;
  sequence: number;
  methodCode: string;
  amount: string;
  currency: string;
  status: PaymentStatus;
  reference: string | null;
  authorizationReference: string | null;
  confirmedAt: Date | null;
};

export type SaleLineInput = SaleLineAmounts & {
  description: string;
  unit: string;
  source: SaleLineSource;
  sourceReference?: string | null;
};

const SALE_LINE_SOURCE_SET = new Set<string>(SALE_LINE_SOURCES);
const PAYMENT_STATUS_SET = new Set<string>(PAYMENT_STATUSES);

function assertPositiveId(value: number, errorCode: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(errorCode);
  }
}

function normalizeCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("INVALID_SALE_CURRENCY");
  }
  return currency;
}

function normalizeRequiredText(
  value: string,
  maxLength: number,
  errorCode: string,
): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(errorCode);
  }
  return normalized;
}

function normalizeOptionalText(
  value: string | null | undefined,
  maxLength: number,
  errorCode: string,
): string | null {
  const normalized = value?.trim() ?? "";
  if (normalized.length > maxLength) {
    throw new Error(errorCode);
  }
  return normalized || null;
}

function decimalString(value: ExactDecimalInput): string {
  return value.toString().trim();
}

function saleSnapshot(sale: SaleRecord): SaleSnapshot {
  return {
    id: sale.id,
    companyId: sale.companyId,
    branchId: sale.branchId,
    terminalId: sale.terminalId,
    status: sale.status,
    currency: sale.currency,
    subtotalAmount: sale.subtotalAmount.toString(),
    discountAmount: sale.discountAmount.toString(),
    netAmount: sale.netAmount.toString(),
    vatAmount: sale.vatAmount.toString(),
    totalAmount: sale.totalAmount.toString(),
    heldAt: sale.heldAt,
    finalizedAt: sale.finalizedAt,
  };
}

function paymentSnapshot(payment: PaymentRecord): PaymentSnapshot {
  return {
    id: payment.id,
    saleId: payment.saleId,
    sequence: payment.sequence,
    methodCode: payment.methodCode,
    amount: payment.amount.toString(),
    currency: payment.currency,
    status: payment.status,
    reference: payment.reference,
    authorizationReference: payment.authorizationReference,
    confirmedAt: payment.confirmedAt,
  };
}

function normalizeSaleLine(input: SaleLineInput): UpdateSaleLineRecordInput {
  if (!SALE_LINE_SOURCE_SET.has(input.source)) {
    throw new Error("INVALID_SALE_LINE_SOURCE");
  }

  const normalized: UpdateSaleLineRecordInput = {
    description: normalizeRequiredText(
      input.description,
      500,
      "INVALID_SALE_LINE_DESCRIPTION",
    ),
    quantity: decimalString(input.quantity),
    unit: normalizeRequiredText(input.unit, 40, "INVALID_SALE_LINE_UNIT"),
    unitPrice: decimalString(input.unitPrice),
    subtotalAmount: decimalString(input.subtotalAmount),
    discountAmount: decimalString(input.discountAmount),
    netAmount: decimalString(input.netAmount),
    vatRate: decimalString(input.vatRate),
    vatAmount: decimalString(input.vatAmount),
    totalAmount: decimalString(input.totalAmount),
    source: input.source,
    sourceReference: normalizeOptionalText(
      input.sourceReference,
      250,
      "INVALID_SALE_LINE_SOURCE_REFERENCE",
    ),
  };

  const errors = validateSaleLineAmounts(normalized);
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }

  return normalized;
}

function assertLineMutable(sale: SaleRecord): void {
  if (sale.status !== "DRAFT") {
    throw new Error("SALE_LINES_NOT_MUTABLE");
  }
}

function assertPaymentRecordable(sale: SaleRecord): void {
  if (sale.status === "CANCELLED" || sale.status === "RETURNED") {
    throw new Error("SALE_NOT_PAYMENT_MUTABLE");
  }
}

async function requireSale(
  tx: SalesTransaction,
  companyId: number,
  saleId: number,
): Promise<SaleRecord> {
  assertPositiveId(companyId, "INVALID_COMPANY_ID");
  assertPositiveId(saleId, "INVALID_SALE_ID");

  const sale = await tx.getSale(companyId, saleId);
  if (!sale) throw new Error("SALE_NOT_FOUND_IN_COMPANY");
  return sale;
}

async function recalculateSaleTotals(
  tx: SalesTransaction,
  companyId: number,
  saleId: number,
): Promise<SaleRecord> {
  const lines = await tx.listSaleLines(companyId, saleId);
  const totals = calculateSaleTotals(lines);
  return tx.updateSaleTotals(companyId, saleId, totals);
}

/**
 * Application service for the Sales core.
 *
 * Authorization and module entitlement are caller responsibilities. Every method
 * still requires companyId and the repository must scope reads/writes by company.
 * The Prisma adapter runs each operation in a SERIALIZABLE transaction.
 */
export class SalesService {
  constructor(private readonly repository: SalesRepository) {}

  async createDraftSale(input: {
    companyId: number;
    branchId: number;
    terminalId?: number | null;
    currency?: string;
  }): Promise<SaleSnapshot> {
    assertPositiveId(input.companyId, "INVALID_COMPANY_ID");
    assertPositiveId(input.branchId, "INVALID_SALES_BRANCH_ID");

    if (input.terminalId !== null && input.terminalId !== undefined) {
      assertPositiveId(input.terminalId, "INVALID_SALES_TERMINAL_ID");
    }

    const currency = normalizeCurrency(input.currency ?? "ISK");

    return this.repository.transaction(async (tx) => {
      const branch = await tx.getBranch(input.companyId, input.branchId);
      if (!branch?.isActive) {
        throw new Error("ACTIVE_SALES_BRANCH_NOT_FOUND");
      }

      const terminalId = input.terminalId ?? null;
      if (terminalId !== null) {
        const terminal = await tx.getTerminal(
          input.companyId,
          input.branchId,
          terminalId,
        );
        if (!terminal?.isActive) {
          throw new Error("ACTIVE_SALES_TERMINAL_NOT_FOUND");
        }
      }

      const sale = await tx.createSale({
        companyId: input.companyId,
        branchId: input.branchId,
        terminalId,
        currency,
      });

      return saleSnapshot(sale);
    });
  }

  async addSaleLine(input: {
    companyId: number;
    saleId: number;
    line: SaleLineInput;
  }): Promise<{ lineId: number; position: number; sale: SaleSnapshot }> {
    const line = normalizeSaleLine(input.line);

    return this.repository.transaction(async (tx) => {
      const sale = await requireSale(tx, input.companyId, input.saleId);
      assertLineMutable(sale);

      const position = await tx.nextSaleLinePosition(input.companyId, input.saleId);
      const created = await tx.createSaleLine({
        companyId: input.companyId,
        saleId: input.saleId,
        position,
        ...line,
      });

      const updatedSale = await recalculateSaleTotals(
        tx,
        input.companyId,
        input.saleId,
      );

      return {
        lineId: created.id,
        position: created.position,
        sale: saleSnapshot(updatedSale),
      };
    });
  }

  async updateSaleLine(input: {
    companyId: number;
    saleId: number;
    lineId: number;
    line: SaleLineInput;
  }): Promise<{ lineId: number; sale: SaleSnapshot }> {
    assertPositiveId(input.lineId, "INVALID_SALE_LINE_ID");
    const line = normalizeSaleLine(input.line);

    return this.repository.transaction(async (tx) => {
      const sale = await requireSale(tx, input.companyId, input.saleId);
      assertLineMutable(sale);

      const existing = await tx.getSaleLine(
        input.companyId,
        input.saleId,
        input.lineId,
      );
      if (!existing) throw new Error("SALE_LINE_NOT_FOUND_IN_SALE");

      await tx.updateSaleLine(input.companyId, input.saleId, existing.id, line);
      const updatedSale = await recalculateSaleTotals(
        tx,
        input.companyId,
        input.saleId,
      );

      return { lineId: existing.id, sale: saleSnapshot(updatedSale) };
    });
  }

  async removeSaleLine(input: {
    companyId: number;
    saleId: number;
    lineId: number;
  }): Promise<SaleSnapshot> {
    assertPositiveId(input.lineId, "INVALID_SALE_LINE_ID");

    return this.repository.transaction(async (tx) => {
      const sale = await requireSale(tx, input.companyId, input.saleId);
      assertLineMutable(sale);

      const existing = await tx.getSaleLine(
        input.companyId,
        input.saleId,
        input.lineId,
      );
      if (!existing) throw new Error("SALE_LINE_NOT_FOUND_IN_SALE");

      await tx.deleteSaleLine(input.companyId, input.saleId, existing.id);
      const updatedSale = await recalculateSaleTotals(
        tx,
        input.companyId,
        input.saleId,
      );

      return saleSnapshot(updatedSale);
    });
  }

  async holdSale(input: {
    companyId: number;
    saleId: number;
    now?: Date;
  }): Promise<SaleSnapshot> {
    return this.repository.transaction(async (tx) => {
      const sale = await requireSale(tx, input.companyId, input.saleId);
      if (sale.status === "HELD") return saleSnapshot(sale);

      assertSaleStatusTransition(sale.status, "HELD");
      const updated = await tx.updateSaleStatus(input.companyId, input.saleId, {
        status: "HELD",
        heldAt: input.now ?? new Date(),
      });
      return saleSnapshot(updated);
    });
  }

  async resumeSale(input: {
    companyId: number;
    saleId: number;
  }): Promise<SaleSnapshot> {
    return this.repository.transaction(async (tx) => {
      const sale = await requireSale(tx, input.companyId, input.saleId);
      if (sale.status === "DRAFT") return saleSnapshot(sale);

      assertSaleStatusTransition(sale.status, "DRAFT");
      const updated = await tx.updateSaleStatus(input.companyId, input.saleId, {
        status: "DRAFT",
        heldAt: null,
      });
      return saleSnapshot(updated);
    });
  }

  async recordPayment(input: {
    companyId: number;
    saleId: number;
    methodCode: string;
    amount: ExactDecimalInput;
    currency?: string;
    reference?: string | null;
    authorizationReference?: string | null;
  }): Promise<PaymentSnapshot> {
    const methodCode = normalizeRequiredText(
      input.methodCode,
      80,
      "INVALID_PAYMENT_METHOD_CODE",
    );
    const amount = decimalString(input.amount);
    if (!isPositivePaymentAmount(amount)) {
      throw new Error("PAYMENT_AMOUNT_MUST_BE_POSITIVE");
    }

    return this.repository.transaction(async (tx) => {
      const sale = await requireSale(tx, input.companyId, input.saleId);
      assertPaymentRecordable(sale);

      const currency = normalizeCurrency(input.currency ?? sale.currency);
      if (currency !== sale.currency) {
        throw new Error("CROSS_CURRENCY_PAYMENT_NOT_SUPPORTED");
      }

      const sequence = await tx.nextPaymentSequence(input.companyId, input.saleId);
      const payment = await tx.createPayment({
        companyId: input.companyId,
        saleId: input.saleId,
        sequence,
        methodCode,
        amount,
        currency,
        reference: normalizeOptionalText(
          input.reference,
          500,
          "INVALID_PAYMENT_REFERENCE",
        ),
        authorizationReference: normalizeOptionalText(
          input.authorizationReference,
          500,
          "INVALID_PAYMENT_AUTHORIZATION_REFERENCE",
        ),
      });

      return paymentSnapshot(payment);
    });
  }

  async transitionPaymentStatus(input: {
    companyId: number;
    saleId: number;
    paymentId: number;
    status: PaymentStatus;
    now?: Date;
  }): Promise<PaymentSnapshot> {
    assertPositiveId(input.paymentId, "INVALID_PAYMENT_ID");
    if (!PAYMENT_STATUS_SET.has(input.status)) {
      throw new Error("INVALID_PAYMENT_STATUS");
    }
    if (input.status === "REFUNDED") {
      throw new Error("PAYMENT_REFUND_REQUIRES_REFUND_WORKFLOW");
    }

    return this.repository.transaction(async (tx) => {
      const sale = await requireSale(tx, input.companyId, input.saleId);
      assertPaymentRecordable(sale);

      const payment = await tx.getPayment(
        input.companyId,
        input.saleId,
        input.paymentId,
      );
      if (!payment) throw new Error("PAYMENT_NOT_FOUND_IN_SALE");
      if (payment.status === input.status) return paymentSnapshot(payment);

      assertPaymentStatusTransition(payment.status, input.status);
      const updated = await tx.updatePaymentStatus(
        input.companyId,
        input.saleId,
        payment.id,
        {
          status: input.status,
          ...(input.status === "CONFIRMED"
            ? { confirmedAt: input.now ?? new Date() }
            : {}),
        },
      );

      return paymentSnapshot(updated);
    });
  }

  async finalizeSale(input: {
    companyId: number;
    saleId: number;
    now?: Date;
  }): Promise<SaleSnapshot & { idempotent: boolean }> {
    return this.repository.transaction(async (tx) => {
      const sale = await requireSale(tx, input.companyId, input.saleId);
      if (sale.status === "FINALIZED") {
        return { ...saleSnapshot(sale), idempotent: true };
      }

      assertSaleStatusTransition(sale.status, "FINALIZED");

      const lines = await tx.listSaleLines(input.companyId, input.saleId);
      if (lines.length === 0) {
        throw new Error("SALE_REQUIRES_AT_LEAST_ONE_LINE");
      }

      for (const line of lines) {
        const errors = validateSaleLineAmounts(line);
        if (errors.length > 0) {
          throw new Error(errors[0]);
        }
      }

      const totals = calculateSaleTotals(lines);
      if (decimalCompare(totals.totalAmount, "0") < 0) {
        throw new Error("SALE_TOTAL_MUST_NOT_BE_NEGATIVE");
      }

      await tx.updateSaleTotals(input.companyId, input.saleId, totals);
      const finalized = await tx.updateSaleStatus(
        input.companyId,
        input.saleId,
        {
          status: "FINALIZED",
          finalizedAt: input.now ?? new Date(),
        },
      );

      return { ...saleSnapshot(finalized), idempotent: false };
    });
  }
}
