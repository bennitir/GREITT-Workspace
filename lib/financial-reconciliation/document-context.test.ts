import assert from "node:assert/strict";
import test from "node:test";
import {
  getSourceDocumentBookingState,
  hasPendingSourceDocumentBooking,
  type FinancialEventSourceDocumentContext,
} from "./document-context";

function context(
  overrides: Partial<FinancialEventSourceDocumentContext> = {},
): FinancialEventSourceDocumentContext {
  return {
    receiptId: 172,
    receiptStatus: "REVIEWED",
    documentId: 374,
    reviewedAt: new Date("2026-09-10T10:56:45.194Z"),
    approvedAt: null,
    documentType: "ACCOUNTING_DOCUMENT",
    documentRole: "BOOKABLE",
    bookingEntries: [
      {
        id: 610,
        account: "4740",
        text: "Kílómetragjald",
        debit: 1675,
        credit: 0,
      },
      {
        id: 611,
        account: "1510",
        text: "Skuld við Skattinn",
        debit: 0,
        credit: 1675,
      },
    ],
    ...overrides,
  };
}

test("reviewed document with booking proposal is pending, not booked", () => {
  const source = context();
  assert.equal(
    getSourceDocumentBookingState(source),
    "REVIEWED_NOT_BOOKED",
  );
  assert.equal(hasPendingSourceDocumentBooking(source), true);
});

test("approved document is booked even when proposal entries are retained", () => {
  const source = context({
    approvedAt: new Date("2026-09-30T10:00:00.000Z"),
    receiptStatus: "APPROVED",
  });
  assert.equal(getSourceDocumentBookingState(source), "BOOKED");
  assert.equal(hasPendingSourceDocumentBooking(source), false);
});

test("unreviewed document with proposal stays explicitly unbooked", () => {
  const source = context({ reviewedAt: null });
  assert.equal(
    getSourceDocumentBookingState(source),
    "UNREVIEWED_NOT_BOOKED",
  );
  assert.equal(hasPendingSourceDocumentBooking(source), true);
});

test("document without booking proposal does not invent a pending booking", () => {
  const source = context({ bookingEntries: [] });
  assert.equal(
    getSourceDocumentBookingState(source),
    "NO_BOOKING_PROPOSAL",
  );
  assert.equal(hasPendingSourceDocumentBooking(source), false);
});
