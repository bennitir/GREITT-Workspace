import assert from "node:assert/strict";
import test from "node:test";
import type { BankBookingCandidate } from "./candidates";
import type { BankFinancialEventCandidateWithReceipts } from "./cross-layer";
import { combineBankReconciliationCandidates } from "./cross-layer";

const booking = (
  patch: Partial<BankBookingCandidate> = {},
): BankBookingCandidate => ({
  bankTransactionId: 277,
  receiptEntryId: 591,
  receiptId: 104,
  voucherNumber: null,
  account: "1510",
  entryText: "Skuld vegna orkureiknings TR004668934",
  description: "Ólesið fylgiskjal",
  bankAmount: -62817,
  bookingAmount: -62817,
  dateDistanceDays: 9,
  partyMatch: true,
  strength: "POSSIBLE",
  reason: "EXTENDED_DATE_AMOUNT_PARTY",
  mutuallyUnique: false,
  ...patch,
});

const event = (
  patch: Partial<BankFinancialEventCandidateWithReceipts> = {},
): BankFinancialEventCandidateWithReceipts => ({
  bankTransactionId: 277,
  eventId: 46,
  eventType: "CHARGE",
  eventAmount: "62817",
  bankAmount: "-62817",
  eventDate: new Date("2026-01-31T12:00:00.000Z"),
  bankDate: new Date("2026-02-09T12:00:00.000Z"),
  dateDistanceDays: 9,
  externalReference: "TR004668934",
  bankReference: "310126",
  reason: "EXACT_EVENT_AMOUNT_EXTENDED_DATE",
  evidence: [],
  strength: "POSSIBLE",
  primaryReceiptIds: [104],
  ...patch,
});

test("same bank transaction and PRIMARY receipt become one cross-layer group", () => {
  const result = combineBankReconciliationCandidates(
    [booking()],
    [event()],
  );

  assert.equal(result.standaloneBookingCandidates.length, 0);
  assert.deepEqual(result.eventGroups[0]?.sharedReceiptIds, [104]);
  assert.deepEqual(
    result.eventGroups[0]?.bookingCandidates.map(
      (candidate) => candidate.receiptEntryId,
    ),
    [591],
  );
});

test("same receipt on another bank transaction is not merged", () => {
  const result = combineBankReconciliationCandidates(
    [booking({ bankTransactionId: 999 })],
    [event()],
  );

  assert.equal(result.standaloneBookingCandidates.length, 1);
  assert.equal(result.eventGroups[0]?.bookingCandidates.length, 0);
});

test("event without PRIMARY receipt stays independent", () => {
  const result = combineBankReconciliationCandidates(
    [booking()],
    [event({ primaryReceiptIds: [] })],
  );

  assert.equal(result.standaloneBookingCandidates.length, 1);
  assert.equal(result.eventGroups[0]?.bookingCandidates.length, 0);
});

test("all booking evidence from the same receipt is retained under one event", () => {
  const result = combineBankReconciliationCandidates(
    [booking(), booking({ receiptEntryId: 592 })],
    [event()],
  );

  assert.equal(result.standaloneBookingCandidates.length, 0);
  assert.deepEqual(
    result.eventGroups[0]?.bookingCandidates.map(
      (candidate) => candidate.receiptEntryId,
    ),
    [591, 592],
  );
  assert.deepEqual(result.eventGroups[0]?.sharedReceiptIds, [104]);
});

test("unrelated booking candidates remain visible", () => {
  const unrelated = booking({
    receiptEntryId: 700,
    receiptId: 200,
  });
  const result = combineBankReconciliationCandidates(
    [booking(), unrelated],
    [event()],
  );

  assert.deepEqual(
    result.standaloneBookingCandidates.map(
      (candidate) => candidate.receiptEntryId,
    ),
    [700],
  );
});
