import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateSaleLineAmounts,
  calculateSaleTotals,
  canTransitionPaymentStatus,
  canTransitionSaleStatus,
  decimalAdd,
  decimalMultiply,
  decimalPercent,
  isPositivePaymentAmount,
  validateSaleLineAmounts,
} from "./sales-domain";

test("sale lifecycle allows hold/resume/finalize and prevents state resurrection", () => {
  assert.equal(canTransitionSaleStatus("DRAFT", "HELD"), true);
  assert.equal(canTransitionSaleStatus("HELD", "DRAFT"), true);
  assert.equal(canTransitionSaleStatus("DRAFT", "FINALIZED"), true);
  assert.equal(canTransitionSaleStatus("HELD", "FINALIZED"), true);
  assert.equal(canTransitionSaleStatus("FINALIZED", "RETURNED"), true);

  assert.equal(canTransitionSaleStatus("FINALIZED", "DRAFT"), false);
  assert.equal(canTransitionSaleStatus("CANCELLED", "DRAFT"), false);
  assert.equal(canTransitionSaleStatus("RETURNED", "FINALIZED"), false);

  // Sama staða er leyfð svo endurtekinn command geti verið idempotent.
  assert.equal(canTransitionSaleStatus("FINALIZED", "FINALIZED"), true);
});

test("payment lifecycle keeps confirmation and refund states separate", () => {
  assert.equal(canTransitionPaymentStatus("PENDING", "AUTHORIZED"), true);
  assert.equal(canTransitionPaymentStatus("PENDING", "CONFIRMED"), true);
  assert.equal(canTransitionPaymentStatus("AUTHORIZED", "CONFIRMED"), true);
  assert.equal(canTransitionPaymentStatus("CONFIRMED", "REFUNDED"), true);

  assert.equal(canTransitionPaymentStatus("CONFIRMED", "PENDING"), false);
  assert.equal(canTransitionPaymentStatus("REFUNDED", "CONFIRMED"), false);
  assert.equal(canTransitionPaymentStatus("CANCELLED", "AUTHORIZED"), false);
});

test("decimal helpers keep money arithmetic exact without floating point drift", () => {
  assert.equal(decimalAdd("0.1", "0.2"), "0.3");
  assert.equal(decimalMultiply("3", "199.95"), "599.85");
  assert.equal(decimalMultiply("2.5", "4.20"), "10.5");
  assert.equal(decimalPercent("500", "24"), "120");
  assert.equal(decimalPercent("0.2", "24"), "0.048");
});

test("sale line calculator derives exact VAT amounts", () => {
  assert.deepEqual(
    calculateSaleLineAmounts({
      quantity: "2",
      unitPrice: "100",
      discountAmount: "20",
      vatRate: "24",
    }),
    {
      quantity: "2",
      unitPrice: "100",
      subtotalAmount: "200",
      discountAmount: "20",
      netAmount: "180",
      vatRate: "24",
      vatAmount: "43.2",
      totalAmount: "223.2",
    },
  );
});

test("sale line amount validation accepts a consistent line", () => {
  const errors = validateSaleLineAmounts({
    quantity: "3",
    unitPrice: "199.95",
    subtotalAmount: "599.85",
    discountAmount: "99.85",
    netAmount: "500",
    vatRate: "24",
    vatAmount: "120",
    totalAmount: "620",
  });

  assert.deepEqual(errors, []);
});

test("sale line amount validation rejects mismatches and excessive discount", () => {
  const errors = validateSaleLineAmounts({
    quantity: "2",
    unitPrice: "100",
    subtotalAmount: "199",
    discountAmount: "250",
    netAmount: "0",
    vatRate: "24",
    vatAmount: "48",
    totalAmount: "40",
  });

  assert.equal(errors.includes("LINE_SUBTOTAL_MISMATCH"), true);
  assert.equal(errors.includes("LINE_DISCOUNT_EXCEEDS_SUBTOTAL"), true);
  assert.equal(errors.includes("LINE_NET_MISMATCH"), true);
  assert.equal(errors.includes("LINE_TOTAL_MISMATCH"), true);
});

test("sale totals sum stored line snapshots exactly", () => {
  const totals = calculateSaleTotals([
    {
      subtotalAmount: "599.85",
      discountAmount: "99.85",
      netAmount: "500",
      vatAmount: "120",
      totalAmount: "620",
    },
    {
      subtotalAmount: "0.2",
      discountAmount: "0",
      netAmount: "0.2",
      vatAmount: "0.048",
      totalAmount: "0.248",
    },
  ]);

  assert.deepEqual(totals, {
    subtotalAmount: "600.05",
    discountAmount: "99.85",
    netAmount: "500.2",
    vatAmount: "120.048",
    totalAmount: "620.248",
  });
});

test("payment amount must be positive", () => {
  assert.equal(isPositivePaymentAmount("1"), true);
  assert.equal(isPositivePaymentAmount("0.01"), true);
  assert.equal(isPositivePaymentAmount("0"), false);
  assert.equal(isPositivePaymentAmount("-1"), false);
});
