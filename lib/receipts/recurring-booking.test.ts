import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRecurringPurchaseSignature,
  findStableRecurringBookingTemplate,
} from "./recurring-booking";

const lines = [
  { description: "Farsími", lineTotal: 6590 },
  { description: "Stofnun kröfu í heimabanka", lineTotal: 189 },
];

const booking = [
  { account: "4400", text: "Farsími", debit: 5315, credit: 0 },
  { account: "4980", text: "Stofnun kröfu í heimabanka", debit: 152, credit: 0 },
  { account: "2520", text: "Innskattur · innskattsfrádráttur 75%", debit: 984, credit: 0 },
  { account: "4400", text: "Ófrádráttarbær VSK 25%", debit: 328, credit: 0 },
  { account: "2000", text: "Viðskiptaskuld", debit: 0, credit: 6779 },
];

test("recurring line signature keeps company-local phone-service meaning without identifiers", () => {
  assert.equal(
    buildRecurringPurchaseSignature(lines),
    "farsimi:6590.00|stofnun_krofu_i_heimabanka:189.00",
  );
});

test("two identical reviewed documents can teach stable debit and credit booking", () => {
  const result = findStableRecurringBookingTemplate({
    totalAmount: 6779,
    purchaseLines: lines,
    priorDocuments: [
      { receiptNumber: "BR2605-A", totalAmount: 6779, purchaseLines: lines, bookingEntries: booking },
      { receiptNumber: "BR2606-B", totalAmount: 6779, purchaseLines: lines, bookingEntries: booking },
    ],
  });

  assert.equal(result.evidenceCount, 2);
  assert.equal(result.debitEntries.length, 4);
  assert.equal(result.creditEntries.length, 1);
});

test("one prior document is not enough for automatic recurring reuse", () => {
  const result = findStableRecurringBookingTemplate({
    totalAmount: 6779,
    purchaseLines: lines,
    priorDocuments: [
      { receiptNumber: "BR2606-B", totalAmount: 6779, purchaseLines: lines, bookingEntries: booking },
    ],
  });
  assert.equal(result.debitEntries.length, 0);
  assert.equal(result.creditEntries.length, 0);
});

test("different credit account preserves stable debit side but fails closed on credit", () => {
  const alternative = booking.map((entry) =>
    entry.account === "2000" ? { ...entry, account: "2230" } : entry,
  );
  const result = findStableRecurringBookingTemplate({
    totalAmount: 6779,
    purchaseLines: lines,
    priorDocuments: [
      { receiptNumber: "BR2605-A", totalAmount: 6779, purchaseLines: lines, bookingEntries: booking },
      { receiptNumber: "BR2606-B", totalAmount: 6779, purchaseLines: lines, bookingEntries: alternative },
    ],
  });
  assert.equal(result.debitEntries.length, 4);
  assert.equal(result.creditEntries.length, 0);
});
