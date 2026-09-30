import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { buildBankDiagnostics } from "./diagnostics";
import { R, REASONS, DIAGNOSTIC_VERSION, BOOKING_STAGES, EVENT_STAGES,
  type DiagnosticInput, type DiagnosticBank, type DiagnosticBooking, type DiagnosticDocument } from "./diagnostics-contract";
import { buildBankBookingCandidateGraph, type BankCandidateInput, type BookingCandidateInput } from "./candidates";
import { buildBankFinancialEventCandidates, type FinancialEventCandidateInput } from "./event-candidates";
import { decideReviewedFinancialEvent } from "../receipts/financial-event-materialization";

const day = (n: number) => new Date(Date.UTC(2026, 0, n));
const bank = (patch: Partial<DiagnosticBank> = {}): DiagnosticBank => ({
  id: 1, companyId: 7, bankAccountId: 8, date: day(2), amount: "-100", text: "Example",
  reference: null, currency: null, status: "UNRECONCILED", ...patch,
});
const booking = (patch: Partial<DiagnosticBooking> = {}): DiagnosticBooking => ({
  companyId: 7, entryId: 10, receiptId: 11, receiptStatus: "APPROVED", voucherNumber: null,
  account: "BANK", debit: 0, credit: 100, date: day(2), partyText: "Different",
  description: null, entryText: "", ...patch,
});
const event = (patch: Partial<FinancialEventCandidateInput> = {}): FinancialEventCandidateInput => ({
  id: 20, companyId: 7, eventType: "CHARGE", currency: "ISK", amount: "100", eventDate: day(1), externalReference: null, ...patch,
});
const document = (patch: Partial<DiagnosticDocument> = {}): DiagnosticDocument => ({
  id: 30, companyId: 7, receiptId: 11, receiptStatus: "REVIEWED", reviewedAt: day(1), approvedAt: null,
  documentRole: "BOOKABLE", documentType: "ACCOUNTING_DOCUMENT", classificationSource: "SYSTEM", totalAmount: 100,
  entityLinks: [{ entity: { id: 40, companyId: 7, entityType: "INVOICE", identifierValue: "INV-1" } }], ...patch,
});
function fixture(): DiagnosticInput {
  return { snapshotId: "synthetic", capturedAt: "2026-01-02T00:00:00Z", account: { id: 8, companyId: 7, ledgerAccountNumber: "BANK" },
    banks: [bank()], bookings: { availability: "AVAILABLE", rows: [] }, events: { availability: "AVAILABLE", rows: [] },
    confirmations: { availability: "AVAILABLE", rows: [] }, documents: { availability: "AVAILABLE", rows: [] },
    documentLinks: { availability: "AVAILABLE", rows: [] } };
}
const row = (input: DiagnosticInput) => buildBankDiagnostics(input).transactions[0];

test("booking NONE + event candidate", () => {
  const input = fixture(); input.events = { availability: "AVAILABLE", rows: [event()] };
  const result = row(input);
  assert.equal(result.booking.state, "NONE");
  assert.equal(result.overall.coverage, "EVENT_ONLY");
  assert.equal(result.overall.state, "SINGLE_TARGET_CANDIDATE");
  assert.equal(result.events.candidates[0].confirmation.state, "NOT_IMPLEMENTED");
});
test("booking NONE + supplied confirmed fact does not require current matching", () => {
  const input = fixture(); input.events = { availability: "AVAILABLE", rows: [event({ amount: "555" })] };
  input.confirmations = { availability: "AVAILABLE", rows: [{ companyId: 7, bankAccountId: 8, bankTransactionId: 1,
    state: "VALID", reconciliationId: 60, paymentId: 61, target: { type: "FINANCIAL_EVENT", id: 20 } }] };
  const result = row(input);
  assert.equal(result.overall.state, "CONFIRMED"); assert.equal(result.confirmed.confirmed, true);
  assert.equal(result.booking.state, "NONE"); assert.equal(result.events.candidateCount, 0);
});
test("booking POSSIBLE + no event; receipt-only context never invents a document", () => {
  const input = fixture(); input.bookings = { availability: "AVAILABLE", rows: [booking()] };
  input.documents = { availability: "AVAILABLE", rows: [document()] };
  const result = row(input);
  assert.equal(result.booking.state, "POSSIBLE"); assert.equal(result.overall.coverage, "BOOKING_ONLY");
  assert.equal(result.documents.contexts[0].documentId, null);
  assert.equal(result.documents.contexts[0].materialization.hasPrimaryEvent, null);
});
test("both layers count distinct targets even with shared receipt", () => {
  const input = fixture(); input.bookings = { availability: "AVAILABLE", rows: [booking()] };
  input.events = { availability: "AVAILABLE", rows: [event()] };
  input.documents = { availability: "AVAILABLE", rows: [document()] };
  input.documentLinks = { availability: "AVAILABLE", rows: [{ role: "PRIMARY", companyId: 7, eventId: 20, receiptId: 11, documentId: 30 }] };
  const result = row(input);
  assert.equal(result.overall.coverage, "BOTH"); assert.equal(result.overall.candidateTargetCount, 2);
  assert.equal(result.overall.state, "MULTIPLE_TARGET_CANDIDATES");
  assert.deepEqual(result.documents.contexts.map(context => context.documentId), [null, 30]);
});
test("multiple event candidates and competing banks retain all targets", () => {
  const input = fixture(); input.banks = [bank(), bank({ id: 2 })];
  input.events = { availability: "AVAILABLE", rows: [event(), event({ id: 21 })] };
  const result = row(input);
  assert.equal(result.overall.state, "MULTIPLE_TARGET_CANDIDATES");
  assert.equal(result.events.competingCandidateCount, 1); assert.equal(result.events.sharedTargetCount, 2);
  assert.equal(result.events.candidates[0].otherBankCandidateCount, 1);
});
test("one blocked candidate remains a candidate; mixed blockers do not hide alternatives", () => {
  const input = fixture(); input.events = { availability: "AVAILABLE", rows: [event()] };
  input.blockers = [{ companyId: 7, bankAccountId: 8, bankTransactionId: 1,
    target: { type: "FINANCIAL_EVENT", id: 20 }, code: R.EVENT_PAYMENT_OVER_ALLOCATION }];
  assert.equal(row(input).overall.state, "CANDIDATES_BLOCKED"); assert.equal(row(input).events.candidateCount, 1);
  input.events.rows = [event(), event({ id: 21 })];
  assert.equal(row(input).overall.state, "MULTIPLE_TARGET_CANDIDATES");
});
test("source unavailable preserves event candidates and uses null instead of false zero", () => {
  const input = fixture(); input.bookings = { availability: "UNAVAILABLE" };
  input.events = { availability: "AVAILABLE", rows: [event()] };
  const result = row(input);
  assert.equal(result.overall.state, "SOURCE_ERROR"); assert.equal(result.booking.state, null);
  assert.equal(result.booking.candidateCount, null); assert.equal(result.booking.eligibleRowCount, null);
  assert.equal(result.overall.candidateTargetCount, null); assert.equal(result.events.candidateCount, 1);
  assert.equal(buildBankDiagnostics(input).completeness, "PARTIAL");
  input.confirmations = { availability: "NOT_EVALUATED" };
  assert.equal(row(input).confirmed.confirmed, null);
});
test("unsupported event type/currency are target facts only, never bank-flow guesses", () => {
  const input = fixture(); input.events = { availability: "AVAILABLE", rows: [
    event({ eventType: "ANNUAL_ASSESSMENT" }), event({ id: 21, currency: "EUR" }),
  ] };
  const result = row(input);
  assert.equal(result.events.eventCountBeforeFilters, 2); assert.equal(result.events.eligibleEventCount, 0);
  assert.equal(result.overall.state, "UNRESOLVED");
  assert.deepEqual(result.events.reasons.map(item => item.code), [R.EVENT_TYPE_UNSUPPORTED, R.EVENT_CURRENCY_UNSUPPORTED]);
});
test("materializable document without event is company inventory, not a bank association", () => {
  const input = fixture(); input.documents = { availability: "AVAILABLE", rows: [document()] };
  const result = buildBankDiagnostics(input), doc = result.companyDocumentInventory.documents[0];
  assert.equal(doc.materialization.eligibility, "ELIGIBLE"); assert.equal(doc.materialization.hasPrimaryEvent, false);
  assert.equal(doc.materialization.reasons[0].code, R.ELIGIBLE_DOCUMENT_WITHOUT_PRIMARY_EVENT);
  assert.deepEqual(result.transactions[0].documents.contexts, []);
  input.documentLinks = { availability: "NOT_EVALUATED" };
  assert.equal(buildBankDiagnostics(input).companyDocumentInventory.documents[0].materialization.hasPrimaryEvent, null);
});
test("receipt-status filtered rows remain visible in first-rejection funnel", () => {
  const input = fixture(); input.bookings = { availability: "AVAILABLE", rows: [booking({ receiptStatus: "REVIEWED" }), booking({ entryId: 12, account: "OTHER" })] };
  const result = row(input);
  assert.equal(result.booking.eligibleRowCount, 0); assert.equal(result.booking.pipeline[0].entered, 2);
  assert.deepEqual(result.booking.reasons.map(item => item.code), [R.BOOKING_ACCOUNT_NOT_SELECTED, R.RECEIPT_STATUS_NOT_APPROVED]);
});
test("all metrics partition transactions and exact absolute amounts without float loss", () => {
  const input = fixture(); input.banks = [bank(), bank({ id: 2, amount: "9007199254740993.01" }), bank({ id: 3, amount: "0.09", currency: "EUR" })];
  input.events = { availability: "AVAILABLE", rows: [event()] };
  const result = buildBankDiagnostics(input);
  for (const cells of [Object.values(result.overall), Object.values(result.coverage),
    result.bookingEventMatrix.map(cell => cell.bucket), result.confirmedCandidateMatrix.map(cell => cell.bucket)]) {
    assert.equal(cells.reduce((sum, cell) => sum + cell.transactionCount, 0), 3);
    const cents = (value: string) => {
      const [integer, fraction = ""] = value.split(".");
      return BigInt(integer) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
    };
    for (const [currency, amount] of Object.entries(result.total.absoluteAmountByCurrency)) {
      assert.equal(cells.reduce((sum, cell) => sum + cents(cell.absoluteAmountByCurrency[currency] ?? "0"), BigInt(0)), cents(amount));
    }
  }
  assert.deepEqual(result.total.absoluteAmountByCurrency, { UNKNOWN: "9007199254741093.01", EUR: "0.09" });
  assert.equal(result.noCandidateInEitherLayer.transactionCount, 2);
});
test("cross-company ids, graph competitors and evidence never leak", () => {
  const input = fixture(); const expected = buildBankDiagnostics(input);
  input.banks = [bank(), bank({ id: 9991, companyId: 99 })];
  input.bookings = { availability: "AVAILABLE", rows: [booking({ entryId: 9992, companyId: 99 })] };
  input.events = { availability: "AVAILABLE", rows: [event({ id: 9993, companyId: 99 })] };
  input.documents = { availability: "AVAILABLE", rows: [document({ id: 9994, companyId: 99 })] };
  input.confirmations = { availability: "AVAILABLE", rows: [{ companyId: 99, bankAccountId: 8, bankTransactionId: 1,
    state: "VALID", paymentId: 9995, reconciliationId: 9996, target: { type: "FINANCIAL_EVENT", id: 9993 } }] };
  input.blockers = [{ companyId: 99, bankAccountId: 8, bankTransactionId: 1, target: { type: "FINANCIAL_EVENT", id: 9993 }, code: R.BANK_PAYMENT_OVER_ALLOCATION }];
  const result = buildBankDiagnostics(input);
  assert.equal(result.completeness, "PARTIAL");
  assert.deepEqual(result.integrity, { state: "ERROR", reasons: [{ code: R.TENANT_SCOPE_VIOLATION,
    ...REASONS[R.TENANT_SCOPE_VIOLATION], source: null, target: null }] });
  assert.deepEqual({ ...result, completeness: expected.completeness, integrity: expected.integrity }, expected);
  for (const id of [9991, 9992, 9993, 9994, 9995, 9996]) assert.ok(!JSON.stringify(result).includes(String(id)));
});
test("unresolvable confirmation does not masquerade as NONE or reveal its target", () => {
  const input = fixture(); input.confirmations = { availability: "AVAILABLE", rows: [{ companyId: 7, bankAccountId: 8, bankTransactionId: 1,
    state: "VALID", paymentId: 77, reconciliationId: 78, target: { type: "FINANCIAL_EVENT", id: 999 } }] };
  const result = row(input); assert.equal(result.confirmed.state, "NOT_EVALUATED");
  assert.deepEqual(result.confirmed.links, []); assert.equal(result.overall.state, "SOURCE_ERROR");
  const snapshot = buildBankDiagnostics(input);
  assert.equal(snapshot.completeness, "PARTIAL");
  assert.deepEqual(snapshot.integrity.reasons.map(item => item.code), [R.TARGET_REFERENCE_UNRESOLVED]);
});
test("explicit foreign ownership is a tenant violation, not a missing-reference inference", () => {
  const input = fixture();
  input.events = { availability: "AVAILABLE", rows: [event({ companyId: 99, id: 90001, externalReference: "PRIVATE" })] };
  const result = buildBankDiagnostics(input);
  assert.equal(result.completeness, "PARTIAL");
  assert.deepEqual(result.integrity.reasons.map(item => item.code), [R.TENANT_SCOPE_VIOLATION]);
  assert.deepEqual(result.transactions[0].events.candidates, []);
  assert.ok(!JSON.stringify(result).includes("90001"));
  assert.ok(!JSON.stringify(result).includes("PRIVATE"));
});
test("missing and unverifiable local references are unresolved without claiming tenant violation", () => {
  const changes: Array<(input: DiagnosticInput) => void> = [
    input => { input.confirmations = { availability: "AVAILABLE", rows: [{ companyId: 7, bankAccountId: 8, bankTransactionId: 1,
      state: "VALID", reconciliationId: 90002, paymentId: 90003, target: { type: "FINANCIAL_EVENT", id: 90001 } }] }; },
    input => { input.confirmations = { availability: "AVAILABLE", rows: [{ companyId: 7, bankAccountId: 8, bankTransactionId: 90001,
      state: "VALID", reconciliationId: 90002, paymentId: 90003, target: { type: "FINANCIAL_EVENT", id: 20 } }] }; },
    input => { input.blockers = [{ companyId: 7, bankAccountId: 8, bankTransactionId: 1,
      target: { type: "RECEIPT_ENTRY", id: 90001 }, code: R.BANK_PAYMENT_OVER_ALLOCATION }]; },
    input => { input.documentLinks = { availability: "AVAILABLE", rows: [{ companyId: 7, role: "PRIMARY", eventId: 90001, documentId: 30, receiptId: 11 }] }; },
    input => { input.documentLinks = { availability: "AVAILABLE", rows: [{ companyId: 7, role: "PRIMARY", eventId: 20, documentId: 90001, receiptId: 11 }] }; },
    input => { input.events = { availability: "NOT_EVALUATED" }; input.confirmations = { availability: "AVAILABLE", rows: [{ companyId: 7, bankAccountId: 8, bankTransactionId: 1,
      state: "VALID", reconciliationId: 90002, paymentId: 90003, target: { type: "FINANCIAL_EVENT", id: 90001 } }] }; },
  ];
  for (const change of changes) {
    const input = fixture(); input.events = { availability: "AVAILABLE", rows: [event({ amount: "555" })] };
    input.documents = { availability: "AVAILABLE", rows: [document()] }; change(input);
    const before = structuredClone(input), result = buildBankDiagnostics(input);
    assert.deepEqual(input, before);
    assert.equal(result.completeness, "PARTIAL"); assert.equal(result.integrity.state, "ERROR");
    assert.deepEqual(result.integrity.reasons.map(item => item.code), [R.TARGET_REFERENCE_UNRESOLVED]);
    for (const item of result.integrity.reasons) {
      assert.equal(item.source, null); assert.equal(item.target, null); assert.equal(item.evidence, undefined);
    }
    assert.deepEqual(result.transactions[0].confirmed.links, []);
    assert.deepEqual(result.transactions[0].documents.contexts, []);
    for (const id of [90001, 90002, 90003]) assert.ok(!JSON.stringify(result).includes(String(id)));
  }
});
test("only VALID supplied confirmations produce CONFIRMED_LINK document contexts", () => {
  for (const type of ["FINANCIAL_EVENT", "RECEIPT_ENTRY"] as const) {
    for (const state of ["VALID", "INCONSISTENT", "UNSUPPORTED_RECORD"] as const) {
      const input = fixture();
      input.events = { availability: "AVAILABLE", rows: [event({ amount: "555" })] };
      input.bookings = { availability: "AVAILABLE", rows: [booking({ credit: 555 })] };
      input.documents = { availability: "AVAILABLE", rows: [document()] };
      input.documentLinks = { availability: "AVAILABLE", rows: [{ role: "PRIMARY", companyId: 7, eventId: 20, receiptId: 11, documentId: 30 }] };
      input.confirmations = { availability: "AVAILABLE", rows: [{ companyId: 7, bankAccountId: 8, bankTransactionId: 1,
        state, reconciliationId: 60, paymentId: type === "FINANCIAL_EVENT" ? 61 : null, target: { type, id: type === "FINANCIAL_EVENT" ? 20 : 10 } }] };
      const result = row(input);
      assert.equal(result.confirmed.links.length, 1); assert.equal(result.confirmed.links[0].state, state);
      assert.equal(result.overall.state, state === "VALID" ? "CONFIRMED" : state === "INCONSISTENT" ? "DATA_CONFLICT" : "SOURCE_ERROR");
      assert.equal(result.documents.contexts.length, state === "VALID" ? 1 : 0);
      for (const context of result.documents.contexts) assert.equal(context.via.kind, "CONFIRMED_LINK");
    }
  }
});
test("VALID confirmation outranks invalid amount while partial totals and reason survive", () => {
  const input = fixture(); input.banks = [bank({ amount: "not-an-amount" })];
  input.events = { availability: "AVAILABLE", rows: [event()] };
  input.confirmations = { availability: "AVAILABLE", rows: [{ companyId: 7, bankAccountId: 8, bankTransactionId: 1,
    state: "VALID", reconciliationId: 60, paymentId: 61, target: { type: "FINANCIAL_EVENT", id: 20 } }] };
  const snapshot = buildBankDiagnostics(input), result = snapshot.transactions[0];
  assert.equal(result.overall.state, "CONFIRMED"); assert.equal(result.confirmed.confirmed, true);
  assert.ok(result.booking.reasons.some(item => item.code === R.BANK_AMOUNT_INVALID));
  assert.equal(snapshot.completeness, "PARTIAL");
  for (const bucket of [snapshot.total, snapshot.overall.CONFIRMED]) {
    assert.equal(bucket.transactionCount, 1);
    assert.deepEqual(bucket.amountTotals, { completeness: "PARTIAL", excludedTransactionCount: 1 });
    assert.deepEqual(bucket.absoluteAmountByCurrency, {});
  }
  input.confirmations.rows = [...input.confirmations.rows, { ...input.confirmations.rows[0], state: "INCONSISTENT", reconciliationId: 62 }];
  assert.equal(row(input).overall.state, "DATA_CONFLICT");
});
test("diagnostic input is not mutated and projection is deterministic", () => {
  const input = fixture(); input.bookings = { availability: "AVAILABLE", rows: [booking()] };
  input.events = { availability: "AVAILABLE", rows: [event()] };
  const before = structuredClone(input), first = buildBankDiagnostics(input);
  assert.deepEqual(input, before); assert.deepEqual(buildBankDiagnostics(input), first);
});
test("missing ledger and wholly unevaluated sources never claim zero candidates", () => {
  const input = fixture(); input.account.ledgerAccountNumber = null;
  assert.equal(row(input).booking.candidateCount, null);
  assert.ok(row(input).booking.reasons.some(item => item.code === R.LEDGER_ACCOUNT_NOT_LINKED));
  input.events = { availability: "NOT_EVALUATED" };
  input.documents = { availability: "NOT_EVALUATED" };
  const result = buildBankDiagnostics(input);
  assert.equal(result.transactions[0].events.eventCountBeforeFilters, null);
  assert.equal(result.transactions[0].events.candidateCount, null);
  assert.equal(result.companyDocumentInventory.countsByEligibility, null);
  assert.equal(result.noCandidateInEitherLayer.transactionCount, 0);
});
test("conflicting supplied confirmations have precedence and retain evidence ids", () => {
  const input = fixture(); input.events = { availability: "AVAILABLE", rows: [event()] };
  input.confirmations = { availability: "AVAILABLE", rows: [{ companyId: 7, bankAccountId: 8, bankTransactionId: 1,
    state: "INCONSISTENT", paymentId: 61, reconciliationId: 60, target: { type: "FINANCIAL_EVENT", id: 20 } }] };
  const result = row(input);
  assert.equal(result.overall.state, "DATA_CONFLICT"); assert.equal(result.confirmed.confirmed, null);
  assert.equal(result.confirmed.links[0].reconciliationId, 60);
  assert.equal(result.events.candidateCount, 1);
});
test("foreign nested entities and document links cannot create bank document evidence", () => {
  const input = fixture(); input.events = { availability: "AVAILABLE", rows: [event()] };
  input.documents = { availability: "AVAILABLE", rows: [document({ entityLinks: [{ entity: {
    id: 9999, companyId: 99, entityType: "INVOICE", identifierValue: "PRIVATE",
  } }] })] };
  input.documentLinks = { availability: "AVAILABLE", rows: [{ role: "PRIMARY", companyId: 7, receiptId: 11, documentId: 30, eventId: 20 }] };
  const result = buildBankDiagnostics(input);
  assert.deepEqual(result.companyDocumentInventory.documents, []);
  assert.deepEqual(result.transactions[0].documents.contexts, []);
  assert.ok(!JSON.stringify(result).includes("PRIVATE"));
  assert.equal(result.integrity.state, "ERROR");
  assert.equal(result.completeness, "PARTIAL");
});
test("invalid bank amounts retain transactions and reasons but never invent amount totals", () => {
  for (const amount of [NaN, Infinity, -Infinity, "", "not-an-amount", "0x10", "1e10001"]) {
    const input = fixture(); input.banks = [bank({ amount })];
    const result = buildBankDiagnostics(input), transaction = result.transactions[0];
    assert.equal(result.total.transactionCount, 1);
    assert.equal(transaction.overall.state, "SOURCE_ERROR");
    assert.ok(transaction.booking.reasons.some(item => item.code === R.BANK_AMOUNT_INVALID));
    assert.equal(result.completeness, "PARTIAL");
    for (const measured of [result.total, result.overall.SOURCE_ERROR,
      ...result.bookingEventMatrix.map(cell => cell.bucket), ...result.confirmedCandidateMatrix.map(cell => cell.bucket)]) {
      assert.deepEqual(measured.absoluteAmountByCurrency, {});
      assert.deepEqual(measured.amountTotals, { completeness: "PARTIAL", excludedTransactionCount: 1 });
    }
  }
});
test("mixed valid and invalid amounts preserve exact partial subtotals in every partition", () => {
  const input = fixture(); input.banks = [bank({ amount: "bad" }), bank({ id: 2, amount: "-10.25" }), bank({ id: 3, amount: "0.75" })];
  const before = structuredClone(input), result = buildBankDiagnostics(input);
  assert.deepEqual(input, before);
  assert.equal(result.total.transactionCount, 3);
  assert.deepEqual(result.total.absoluteAmountByCurrency, { UNKNOWN: "11" });
  assert.deepEqual(result.total.amountTotals, { completeness: "PARTIAL", excludedTransactionCount: 1 });
  for (const cells of [Object.values(result.overall), Object.values(result.coverage),
    result.bookingEventMatrix.map(cell => cell.bucket), result.confirmedCandidateMatrix.map(cell => cell.bucket)]) {
    assert.equal(cells.reduce((sum, cell) => sum + cell.transactionCount, 0), 3);
    assert.equal(cells.reduce((sum, cell) => sum + cell.amountTotals.excludedTransactionCount, 0), 1);
    assert.equal(cells.reduce((sum, cell) => sum + Number(cell.absoluteAmountByCurrency.UNKNOWN ?? 0), 0), 11);
  }
});
test("each ownership boundary independently marks integrity partial without foreign evidence", () => {
  const changes: Array<(input: DiagnosticInput) => void> = [
    input => { input.banks = [...input.banks, bank({ id: 90001, companyId: 99, text: "FOREIGN", amount: "99999.99" })]; },
    input => { input.banks = [...input.banks, bank({ id: 90001, bankAccountId: 99 })]; },
    input => { input.bookings = { availability: "AVAILABLE", rows: [booking({ companyId: 99, entryId: 90001, entryText: "FOREIGN" })] }; },
    input => { input.events = { availability: "AVAILABLE", rows: [event({ companyId: 99, id: 90001, externalReference: "FOREIGN" })] }; },
    input => { input.documents = { availability: "AVAILABLE", rows: [document({ companyId: 99, id: 90001 })] }; },
    input => { input.documents = { availability: "AVAILABLE", rows: [document({ entityLinks: [{ entity: { companyId: 99, id: 90001, entityType: "INVOICE", identifierValue: "FOREIGN" } }] })] }; },
    input => { input.documentLinks = { availability: "AVAILABLE", rows: [{ role: "PRIMARY", companyId: 99, receiptId: 90001, documentId: 90002, eventId: 90003 }] }; },
    input => { input.confirmations = { availability: "AVAILABLE", rows: [{ companyId: 99, bankAccountId: 8, bankTransactionId: 1,
      state: "VALID", paymentId: 90001, reconciliationId: 90002, target: { type: "FINANCIAL_EVENT", id: 90003 } }] }; },
    input => { input.blockers = [{ companyId: 99, bankAccountId: 8, bankTransactionId: 1,
      target: { type: "FINANCIAL_EVENT", id: 90001 }, code: R.EVENT_PAYMENT_OVER_ALLOCATION }]; },
  ];
  for (const change of changes) {
    const input = fixture(); change(input);
    const before = structuredClone(input), result = buildBankDiagnostics(input);
    assert.deepEqual(input, before);
    assert.equal(result.completeness, "PARTIAL"); assert.equal(result.integrity.state, "ERROR");
    assert.equal(result.integrity.reasons[0].code, R.TENANT_SCOPE_VIOLATION);
    const serialized = JSON.stringify(result);
    for (const forbidden of ["90001", "90002", "90003", "FOREIGN", "99999.99"]) assert.ok(!serialized.includes(forbidden));
  }
});
test("local assertions cannot attach a foreign target or manufacture missing-primary evidence", () => {
  const input = fixture(); input.events = { availability: "AVAILABLE", rows: [event({ id: 90001, companyId: 99 })] };
  input.documents = { availability: "AVAILABLE", rows: [document()] };
  input.documentLinks = { availability: "AVAILABLE", rows: [{ role: "PRIMARY", companyId: 7, receiptId: 11, documentId: 30, eventId: 90001 }] };
  input.confirmations = { availability: "AVAILABLE", rows: [{ companyId: 7, bankAccountId: 8, bankTransactionId: 1,
    state: "VALID", paymentId: 90002, reconciliationId: 90003, target: { type: "FINANCIAL_EVENT", id: 90001 } }] };
  input.blockers = [{ companyId: 7, bankAccountId: 8, bankTransactionId: 1, target: { type: "FINANCIAL_EVENT", id: 90001 }, code: R.EVENT_PAYMENT_OVER_ALLOCATION }];
  const result = buildBankDiagnostics(input);
  assert.equal(result.integrity.state, "ERROR"); assert.equal(result.completeness, "PARTIAL");
  assert.deepEqual(result.transactions[0].confirmed.links, []);
  assert.deepEqual(result.transactions[0].documents.contexts, []);
  const materialization = result.companyDocumentInventory.documents[0].materialization;
  assert.equal(materialization.hasPrimaryEvent, null);
  assert.ok(!materialization.reasons.some(item => item.code === R.ELIGIBLE_DOCUMENT_WITHOUT_PRIMARY_EVENT));
  for (const id of [90001, 90002, 90003]) assert.ok(!JSON.stringify(result).includes(String(id)));
});
test("duplicate local source ids fail explicitly instead of distorting candidate cardinality", () => {
  const input = fixture(); input.events = { availability: "AVAILABLE", rows: [event(), event()] };
  assert.throws(() => buildBankDiagnostics(input), /Duplicate diagnostic source id/);
});
test("closed versioned reasons and pipelines conserve every first rejection", () => {
  for (const definition of Object.values(REASONS)) assert.equal(definition.ruleVersion, DIAGNOSTIC_VERSION);
  assert.equal(new Set(BOOKING_STAGES).size, BOOKING_STAGES.length); assert.equal(new Set(EVENT_STAGES).size, EVENT_STAGES.length);
  const input = fixture(); input.events = { availability: "AVAILABLE", rows: [event(), event({ id: 21, amount: "200" }), event({ id: 22, currency: "EUR" }), event({ id: 23, eventDate: day(60) })] };
  for (const stages of [row(input).booking.pipeline, row(input).events.pipeline]) {
    stages.forEach((stage, index) => {
      assert.equal(stage.entered, stage.passed + stage.rejected);
      assert.equal(stage.rejected, stage.rejectedByPrimaryReason.reduce((sum, item) => sum + item.count, 0));
      if (index) assert.equal(stage.entered, stages[index - 1].passed);
    });
  }
});

/** Frozen regression fingerprints cover every output field and array order.
 * Captured from the fixture outputs already verified against the pre-refactor implementation.
 * No git history, external files, or application bootstrap is needed.
 */
const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
test("booking regression fingerprints preserve ordering, strength and mutual uniqueness", () => {
  const banks: BankCandidateInput[] = [];
  const entries: BookingCandidateInput[] = [];
  const amounts = [-100, 100, 0, 100.004, NaN, Infinity, 90071992547409.91];
  for (const amount of amounts) for (const text of ["Example", "Example ehf.", "Other", "", "Þór hf"])
    banks.push(bank({ id: banks.length + 1, amount, text }));
  for (const amount of amounts) for (const date of [null, day(2), day(5), day(6), day(32), day(33), new Date(NaN)])
    for (const partyText of ["Example", "Other", null]) entries.push(booking({ entryId: entries.length + 1, debit: Math.max(amount, 0), credit: Math.max(-amount, 0), date, partyText }));
  const fingerprints = ([[banks, entries], [[banks[0]], [entries[0]]], [[...banks].reverse(), [...entries].reverse()]] as const)
    .map(([b, e]) => fingerprint(buildBankBookingCandidateGraph([...b], [...e])));
  assert.deepEqual(fingerprints, [
    "00ebfd392e0e544d1ede2531e18a15f7fe1ab6270f4026ce103bc6524c73d0f2",
    "a91fc7b22c8bfa74f458013999ba1a5a260903af051377aaeaf245bb83938b93",
    "21cdeac47c12c7241af288e7235aa12dba0abee06e32bfbc524c07b8391b66c7",
  ]);
});
test("event regression fingerprints preserve evidence, strength and ordering", () => {
  const banks = [bank(), bank({ id: 2, amount: "100" }), bank({ id: 3, reference: " inv-1 " }), bank({ id: 4, amount: "0" }), bank({ id: 5, date: new Date(NaN) }), bank({ id: 6, amount: "-9007199254740993.01" })];
  const events: FinancialEventCandidateInput[] = [];
  for (const eventType of ["CHARGE", "CREDIT", "OTHER"]) for (const amount of [null, "100", "-100", "100.001", "0", "1e2", "9007199254740993.01"])
    for (const eventDate of [null, day(-29), day(-28), day(2), day(5), day(6), day(32), day(33), new Date(NaN)])
      events.push(event({ id: events.length + 1, eventType, amount, eventDate }));
  for (const primarySourceDocumentDates of [[], [day(5)], [day(1), day(5)]]) for (const externalReference of [null, "INV-1", "INV1"])
    events.push(event({ id: events.length + 1, primarySourceDocumentDates, externalReference, sourceDueDate: day(2), sourceFinalDueDate: day(2) }));
  events.push(event({ id: 9991, currency: "EUR" }), event({ id: 9992, companyId: 99 }));
  assert.equal(fingerprint(buildBankFinancialEventCandidates({ id: 8, companyId: 7 }, banks, events)), "350c8f8a450f2d277f0ac2849916d7e323471d6049b630ba0943b9b2158ee20d");
  assert.equal(fingerprint(buildBankFinancialEventCandidates({ id: 8, companyId: 7 }, [...banks].reverse(), [...events].reverse())), "350c8f8a450f2d277f0ac2849916d7e323471d6049b630ba0943b9b2158ee20d");
});
test("materialization public decision regression fixtures", () => {
  const decisions: unknown[] = [];
  for (const documentType of ["ACCOUNTING_DOCUMENT", "CREDIT_NOTE", "OTHER", null])
    for (const totalAmount of [null, undefined, 0, 100, -100, NaN, Infinity])
      for (const classificationSource of ["SYSTEM", "MANUAL", null])
        for (const entityLinks of [[], document().entityLinks, [...document().entityLinks, ...document().entityLinks]]) {
          const doc = document({ documentType, totalAmount, classificationSource, entityLinks });
          decisions.push(decideReviewedFinancialEvent(doc));
        }
  for (const paymentSchedule of [{ installments: [{}] }, { installments: [] }, null]) {
    const doc = document({ paymentSchedule });
    decisions.push(decideReviewedFinancialEvent(doc));
  }
  assert.equal(fingerprint(decisions), "90130d6e7b431bad0da4578cd18cc1238e54bfe2278c87eece650bfae69276df");
});
