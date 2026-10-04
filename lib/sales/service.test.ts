import assert from "node:assert/strict";
import test from "node:test";

import {
  SalesService,
  type CreatePaymentRecordInput,
  type CreateSaleLineRecordInput,
  type CreateSaleRecordInput,
  type PaymentRecord,
  type SalesBranchRecord,
  type SalesRepository,
  type SalesTerminalRecord,
  type SalesTransaction,
  type SaleLineRecord,
  type SaleRecord,
  type SaleTotals,
  type UpdateSaleLineRecordInput,
} from "./service";

type State = {
  branches: SalesBranchRecord[];
  terminals: SalesTerminalRecord[];
  sales: SaleRecord[];
  lines: SaleLineRecord[];
  payments: PaymentRecord[];
};

function cloneState(state: State): State {
  return {
    branches: state.branches.map((row) => ({ ...row })),
    terminals: state.terminals.map((row) => ({ ...row })),
    sales: state.sales.map((row) => ({ ...row })),
    lines: state.lines.map((row) => ({ ...row })),
    payments: state.payments.map((row) => ({ ...row })),
  };
}

class MemoryRepository implements SalesRepository {
  state: State;

  constructor(seed?: Partial<State>) {
    this.state = {
      branches: seed?.branches ?? [
        { id: 11, companyId: 7, isActive: true },
      ],
      terminals: seed?.terminals ?? [
        { id: 21, companyId: 7, branchId: 11, isActive: true },
      ],
      sales: seed?.sales ?? [],
      lines: seed?.lines ?? [],
      payments: seed?.payments ?? [],
    };
  }

  async transaction<T>(
    operation: (tx: SalesTransaction) => Promise<T>,
  ): Promise<T> {
    const working = cloneState(this.state);
    const tx = this.createTransaction(working);
    const result = await operation(tx);
    this.state = working;
    return result;
  }

  private createTransaction(state: State): SalesTransaction {
    return {
      getBranch: async (companyId, branchId) =>
        state.branches.find(
          (row) => row.companyId === companyId && row.id === branchId,
        ) ?? null,

      getTerminal: async (companyId, branchId, terminalId) =>
        state.terminals.find(
          (row) =>
            row.companyId === companyId &&
            row.branchId === branchId &&
            row.id === terminalId,
        ) ?? null,

      createSale: async (input: CreateSaleRecordInput) => {
        const sale: SaleRecord = {
          id: Math.max(0, ...state.sales.map((row) => row.id)) + 1,
          companyId: input.companyId,
          branchId: input.branchId,
          terminalId: input.terminalId,
          status: "DRAFT",
          currency: input.currency,
          subtotalAmount: "0",
          discountAmount: "0",
          netAmount: "0",
          vatAmount: "0",
          totalAmount: "0",
          heldAt: null,
          finalizedAt: null,
          cancelledAt: null,
          returnedAt: null,
        };
        state.sales.push(sale);
        return { ...sale };
      },

      getSale: async (companyId, saleId) =>
        state.sales.find(
          (row) => row.companyId === companyId && row.id === saleId,
        ) ?? null,

      updateSaleTotals: async (
        companyId,
        saleId,
        totals: SaleTotals,
      ) => {
        const sale = state.sales.find(
          (row) => row.companyId === companyId && row.id === saleId,
        );
        if (!sale) throw new Error("TEST_SALE_NOT_FOUND");
        Object.assign(sale, totals);
        return { ...sale };
      },

      updateSaleStatus: async (companyId, saleId, input) => {
        const sale = state.sales.find(
          (row) => row.companyId === companyId && row.id === saleId,
        );
        if (!sale) throw new Error("TEST_SALE_NOT_FOUND");
        Object.assign(sale, input);
        return { ...sale };
      },

      nextSaleLinePosition: async (companyId, saleId) => {
        const positions = state.lines
          .filter(
            (row) => row.companyId === companyId && row.saleId === saleId,
          )
          .map((row) => row.position);
        return Math.max(0, ...positions) + 1;
      },

      getSaleLine: async (companyId, saleId, lineId) =>
        state.lines.find(
          (row) =>
            row.companyId === companyId &&
            row.saleId === saleId &&
            row.id === lineId,
        ) ?? null,

      listSaleLines: async (companyId, saleId) =>
        state.lines
          .filter(
            (row) => row.companyId === companyId && row.saleId === saleId,
          )
          .sort((a, b) => a.position - b.position)
          .map((row) => ({ ...row })),

      createSaleLine: async (input: CreateSaleLineRecordInput) => {
        const line: SaleLineRecord = {
          id: Math.max(0, ...state.lines.map((row) => row.id)) + 1,
          ...input,
        };
        state.lines.push(line);
        return { ...line };
      },

      updateSaleLine: async (
        companyId,
        saleId,
        lineId,
        input: UpdateSaleLineRecordInput,
      ) => {
        const line = state.lines.find(
          (row) =>
            row.id === lineId &&
            row.companyId === companyId &&
            row.saleId === saleId,
        );
        if (!line) throw new Error("TEST_LINE_NOT_FOUND");
        Object.assign(line, input);
        return { ...line };
      },

      deleteSaleLine: async (companyId, saleId, lineId) => {
        const index = state.lines.findIndex(
          (row) =>
            row.id === lineId &&
            row.companyId === companyId &&
            row.saleId === saleId,
        );
        if (index < 0) throw new Error("TEST_LINE_NOT_FOUND");
        state.lines.splice(index, 1);
      },

      hasSalePayments: async (companyId, saleId) =>
        state.payments.some(
          (row) => row.companyId === companyId && row.saleId === saleId,
        ),

      nextPaymentSequence: async (companyId, saleId) => {
        const sequences = state.payments
          .filter(
            (row) => row.companyId === companyId && row.saleId === saleId,
          )
          .map((row) => row.sequence);
        return Math.max(0, ...sequences) + 1;
      },

      createPayment: async (input: CreatePaymentRecordInput) => {
        const payment: PaymentRecord = {
          id: Math.max(0, ...state.payments.map((row) => row.id)) + 1,
          ...input,
          exchangeRate: null,
          status: "PENDING",
          confirmedAt: null,
        };
        state.payments.push(payment);
        return { ...payment };
      },

      getPayment: async (companyId, saleId, paymentId) =>
        state.payments.find(
          (row) =>
            row.companyId === companyId &&
            row.saleId === saleId &&
            row.id === paymentId,
        ) ?? null,

      updatePaymentStatus: async (companyId, saleId, paymentId, input) => {
        const payment = state.payments.find(
          (row) =>
            row.id === paymentId &&
            row.companyId === companyId &&
            row.saleId === saleId,
        );
        if (!payment) throw new Error("TEST_PAYMENT_NOT_FOUND");
        Object.assign(payment, input);
        return { ...payment };
      },
    };
  }
}

function sampleLine(
  overrides: Partial<Parameters<SalesService["addSaleLine"]>[0]["line"]> = {},
) {
  return {
    description: "Vara",
    quantity: "2",
    unit: "stk",
    unitPrice: "100",
    subtotalAmount: "200",
    discountAmount: "20",
    netAmount: "180",
    vatRate: "24",
    vatAmount: "43.2",
    totalAmount: "223.2",
    source: "FREE_LINE" as const,
    ...overrides,
  };
}

test("creates a tenant-safe draft sale with required terminal", async () => {
  const repository = new MemoryRepository();
  const service = new SalesService(repository);

  const sale = await service.createDraftSale({
    companyId: 7,
    branchId: 11,
    terminalId: 21,
  });

  assert.equal(sale.status, "DRAFT");
  assert.equal(sale.currency, "ISK");
  assert.equal(sale.terminalId, 21);

  await assert.rejects(
    () =>
      service.createDraftSale({
        companyId: 7,
        branchId: 11,
        terminalId: 0,
      }),
    /INVALID_SALES_TERMINAL_ID/,
  );

  await assert.rejects(
    () =>
      service.createDraftSale({
        companyId: 8,
        branchId: 11,
        terminalId: 21,
      }),
    /ACTIVE_SALES_BRANCH_NOT_FOUND/,
  );

  await assert.rejects(
    () =>
      service.createDraftSale({
        companyId: 7,
        branchId: 11,
        terminalId: 999,
      }),
    /ACTIVE_SALES_TERMINAL_NOT_FOUND/,
  );
});
test("line writes recalculate stored sale totals and append positions", async () => {
  const repository = new MemoryRepository();
  const service = new SalesService(repository);
  const sale = await service.createDraftSale({
    companyId: 7,
    branchId: 11,
    terminalId: 21,
  });

  const first = await service.addSaleLine({
    companyId: 7,
    saleId: sale.id,
    line: sampleLine(),
  });
  assert.equal(first.position, 1);
  assert.equal(first.sale.totalAmount, "223.2");

  const second = await service.addSaleLine({
    companyId: 7,
    saleId: sale.id,
    line: sampleLine({
      quantity: "1",
      unitPrice: "50",
      subtotalAmount: "50",
      discountAmount: "0",
      netAmount: "50",
      vatAmount: "12",
      totalAmount: "62",
    }),
  });

  assert.equal(second.position, 2);
  assert.equal(second.sale.subtotalAmount, "250");
  assert.equal(second.sale.discountAmount, "20");
  assert.equal(second.sale.netAmount, "230");
  assert.equal(second.sale.vatAmount, "55.2");
  assert.equal(second.sale.totalAmount, "285.2");
});


test("line updates and removals recalculate totals", async () => {
  const repository = new MemoryRepository();
  const service = new SalesService(repository);
  const sale = await service.createDraftSale({
    companyId: 7,
    branchId: 11,
    terminalId: 21,
  });

  const first = await service.addSaleLine({
    companyId: 7,
    saleId: sale.id,
    line: sampleLine(),
  });
  const second = await service.addSaleLine({
    companyId: 7,
    saleId: sale.id,
    line: sampleLine(),
  });

  const updated = await service.updateSaleLine({
    companyId: 7,
    saleId: sale.id,
    lineId: first.lineId,
    line: sampleLine({
      quantity: "1",
      unitPrice: "100",
      subtotalAmount: "100",
      discountAmount: "0",
      netAmount: "100",
      vatAmount: "24",
      totalAmount: "124",
    }),
  });

  assert.equal(updated.sale.subtotalAmount, "300");
  assert.equal(updated.sale.discountAmount, "20");
  assert.equal(updated.sale.netAmount, "280");
  assert.equal(updated.sale.vatAmount, "67.2");
  assert.equal(updated.sale.totalAmount, "347.2");

  const afterRemoval = await service.removeSaleLine({
    companyId: 7,
    saleId: sale.id,
    lineId: second.lineId,
  });

  assert.equal(afterRemoval.subtotalAmount, "100");
  assert.equal(afterRemoval.discountAmount, "0");
  assert.equal(afterRemoval.netAmount, "100");
  assert.equal(afterRemoval.vatAmount, "24");
  assert.equal(afterRemoval.totalAmount, "124");
});


test("held sales freeze lines until resumed", async () => {
  const repository = new MemoryRepository();
  const service = new SalesService(repository);
  const sale = await service.createDraftSale({
    companyId: 7,
    branchId: 11,
    terminalId: 21,
  });

  await service.holdSale({
    companyId: 7,
    saleId: sale.id,
    now: new Date("2026-10-01T12:00:00Z"),
  });

  await assert.rejects(
    () =>
      service.addSaleLine({
        companyId: 7,
        saleId: sale.id,
        line: sampleLine(),
      }),
    /SALE_LINES_NOT_MUTABLE/,
  );

  const resumed = await service.resumeSale({
    companyId: 7,
    saleId: sale.id,
  });
  assert.equal(resumed.status, "DRAFT");
  assert.equal(resumed.heldAt, null);

  await service.addSaleLine({
    companyId: 7,
    saleId: sale.id,
    line: sampleLine(),
  });
  assert.equal(repository.state.lines.length, 1);
});

test("void cancels draft and held sales and is idempotent", async () => {
  const repository = new MemoryRepository();
  const service = new SalesService(repository);
  const draft = await service.createDraftSale({
    companyId: 7,
    branchId: 11,
    terminalId: 21,
  });
  const cancelledAt = new Date("2026-10-03T22:45:00Z");

  const cancelledDraft = await service.voidSale({
    companyId: 7,
    saleId: draft.id,
    now: cancelledAt,
  });
  assert.equal(cancelledDraft.status, "CANCELLED");
  assert.equal(cancelledDraft.cancelledAt?.toISOString(), cancelledAt.toISOString());
  assert.equal(cancelledDraft.heldAt, null);
  assert.equal(cancelledDraft.idempotent, false);

  const repeated = await service.voidSale({
    companyId: 7,
    saleId: draft.id,
  });
  assert.equal(repeated.status, "CANCELLED");
  assert.equal(repeated.idempotent, true);

  const held = await service.createDraftSale({
    companyId: 7,
    branchId: 11,
    terminalId: 21,
  });
  await service.holdSale({
    companyId: 7,
    saleId: held.id,
    now: new Date("2026-10-03T22:46:00Z"),
  });
  const cancelledHeld = await service.voidSale({
    companyId: 7,
    saleId: held.id,
    now: new Date("2026-10-03T22:47:00Z"),
  });
  assert.equal(cancelledHeld.status, "CANCELLED");
  assert.equal(cancelledHeld.heldAt, null);
});

test("void rejects sales that already have payments", async () => {
  const repository = new MemoryRepository();
  const service = new SalesService(repository);
  const sale = await service.createDraftSale({
    companyId: 7,
    branchId: 11,
    terminalId: 21,
  });

  await service.recordPayment({
    companyId: 7,
    saleId: sale.id,
    methodCode: "CARD",
    amount: "100",
  });

  await assert.rejects(
    () => service.voidSale({ companyId: 7, saleId: sale.id }),
    /SALE_WITH_PAYMENTS_CANNOT_BE_VOIDED/,
  );
});

test("payments have independent sequence and lifecycle", async () => {
  const repository = new MemoryRepository();
  const service = new SalesService(repository);
  const sale = await service.createDraftSale({
    companyId: 7,
    branchId: 11,
    terminalId: 21,
  });

  const payment = await service.recordPayment({
    companyId: 7,
    saleId: sale.id,
    methodCode: "CARD",
    amount: "100",
  });
  assert.equal(payment.sequence, 1);
  assert.equal(payment.status, "PENDING");

  const confirmed = await service.transitionPaymentStatus({
    companyId: 7,
    saleId: sale.id,
    paymentId: payment.id,
    status: "CONFIRMED",
    now: new Date("2026-10-01T12:30:00Z"),
  });
  assert.equal(confirmed.status, "CONFIRMED");
  assert.equal(
    confirmed.confirmedAt?.toISOString(),
    "2026-10-01T12:30:00.000Z",
  );

  await assert.rejects(
    () =>
      service.transitionPaymentStatus({
        companyId: 7,
        saleId: sale.id,
        paymentId: payment.id,
        status: "REFUNDED",
      }),
    /PAYMENT_REFUND_REQUIRES_REFUND_WORKFLOW/,
  );

  await assert.rejects(
    () =>
      service.recordPayment({
        companyId: 7,
        saleId: sale.id,
        methodCode: "CARD",
        amount: "10",
        currency: "EUR",
      }),
    /CROSS_CURRENCY_PAYMENT_NOT_SUPPORTED/,
  );
});

test("finalization requires lines, freezes them, and is payment-independent", async () => {
  const repository = new MemoryRepository();
  const service = new SalesService(repository);
  const sale = await service.createDraftSale({
    companyId: 7,
    branchId: 11,
    terminalId: 21,
  });

  await assert.rejects(
    () => service.finalizeSale({ companyId: 7, saleId: sale.id }),
    /SALE_REQUIRES_AT_LEAST_ONE_LINE/,
  );

  await service.addSaleLine({
    companyId: 7,
    saleId: sale.id,
    line: sampleLine(),
  });

  const finalized = await service.finalizeSale({
    companyId: 7,
    saleId: sale.id,
    now: new Date("2026-10-01T13:00:00Z"),
  });

  assert.equal(finalized.status, "FINALIZED");
  assert.equal(finalized.totalAmount, "223.2");
  assert.equal(finalized.idempotent, false);

  const repeated = await service.finalizeSale({
    companyId: 7,
    saleId: sale.id,
  });
  assert.equal(repeated.idempotent, true);

  await assert.rejects(
    () =>
      service.addSaleLine({
        companyId: 7,
        saleId: sale.id,
        line: sampleLine(),
      }),
    /SALE_LINES_NOT_MUTABLE/,
  );

  const paymentAfterFinalize = await service.recordPayment({
    companyId: 7,
    saleId: sale.id,
    methodCode: "BANK",
    amount: "223.2",
  });
  assert.equal(paymentAfterFinalize.status, "PENDING");
});

test("sale and line lookups fail closed across companies", async () => {
  const repository = new MemoryRepository();
  const service = new SalesService(repository);
  const sale = await service.createDraftSale({
    companyId: 7,
    branchId: 11,
    terminalId: 21,
  });
  const line = await service.addSaleLine({
    companyId: 7,
    saleId: sale.id,
    line: sampleLine(),
  });

  await assert.rejects(
    () =>
      service.updateSaleLine({
        companyId: 8,
        saleId: sale.id,
        lineId: line.lineId,
        line: sampleLine(),
      }),
    /SALE_NOT_FOUND_IN_COMPANY/,
  );

  assert.equal(repository.state.lines[0]?.companyId, 7);
});
