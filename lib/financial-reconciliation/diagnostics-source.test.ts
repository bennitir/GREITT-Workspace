import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { PrismaClient } from "../../app/generated/prisma/client";
import { loadBankDiagnosticSource, type DiagnosticReadDb, type DiagnosticReadRows,
  type BankDiagnosticSource } from "./diagnostics-source";
import { buildBankDiagnosticSnapshotFromSource } from "./diagnostics-service";
import { buildBankDiagnostics } from "./diagnostics";
import { DIAGNOSTIC_VERSION, R } from "./diagnostics-contract";

// Compile-time compatibility only: no client is constructed or imported at runtime.
const acceptsPrismaReadDelegates: (db: PrismaClient) => DiagnosticReadDb = db => db;
void acceptsPrismaReadDelegates;
const day = new Date("2026-01-02T00:00:00.000Z");
const owner = { id: 8, companyId: 7 };
const receipt = { id: 11, companyId: 7, status: "APPROVED", aiDate: day, date: day,
  merchantName: "Example", description: "Example receipt", voucherNumber: 1 };
const bank = (patch: Partial<DiagnosticReadRows["bankTransaction"]> = {}): DiagnosticReadRows["bankTransaction"] => ({
  id: 1, bankAccountId: 8, bankAccount: owner, amount: "-100", date: day, reference: null,
  text: "Example", sourceRawData: null, status: "UNRECONCILED", ...patch,
});
const event = (patch: Partial<DiagnosticReadRows["financialEvent"]> = {}): DiagnosticReadRows["financialEvent"] => ({
  id: 20, companyId: 7, eventType: "CHARGE", amount: "100", currency: "ISK", eventDate: day,
  externalReference: "INV-1", status: "OPEN", ...patch,
});
const document = (): DiagnosticReadRows["aiDetectedDocument"] => ({
  id: 30, receiptId: 11, receipt, date: day, summary: "Gjalddagi: 02.01.2026",
  documentRole: "BOOKABLE", documentType: "ACCOUNTING_DOCUMENT", classificationSource: "SYSTEM",
  totalAmount: 100, receiptNumber: "INV-1", paymentSchedule: null, reviewedAt: day, approvedAt: null,
  bookingEntries: [{ documentId: 30, account: "EXPENSE", text: "Charge", debit: 100, credit: 0 }],
  entityLinks: [{ receiptId: 11, documentId: 30, entityId: 40, receipt: { id: 11, companyId: 7 },
    entity: { id: 40, companyId: 7, entityType: "INVOICE", identifierValue: "INV-1" } }],
});
const link = (): DiagnosticReadRows["documentFinancialEvent"] => ({
  id: 50, receiptId: 11, documentId: 30, eventId: 20, role: "PRIMARY", source: "REVIEWED_DOCUMENT",
  receipt: { id: 11, companyId: 7 }, event: { id: 20, companyId: 7 },
  document: { id: 30, receiptId: 11, receipt: { id: 11, companyId: 7 } },
});
const payment = (): DiagnosticReadRows["financialEventPayment"] => ({
  id: 61, eventId: 20, bankTransactionId: 1, amount: "100", currency: "ISK", status: "CONFIRMED",
  event: { id: 20, companyId: 7 }, bankTransaction: { id: 1, bankAccountId: 8, amount: "-100", bankAccount: owner },
});
const reconciliation = (): DiagnosticReadRows["financialReconciliation"] => ({
  id: 60, companyId: 7, reconciliationType: "BANK_TO_FINANCIAL_EVENT", status: "CONFIRMED",
  participants: [
    { sourceType: "BANK_TRANSACTION", sourceKey: "1", role: "MONEY_MOVEMENT", matchedAmount: "100" },
    { sourceType: "FINANCIAL_EVENT", sourceKey: "20", role: "OBLIGATION", matchedAmount: "100" },
  ],
});
function fake() {
  const rows = {
    bankAccount: { ...owner, ledgerAccount: { id: 9, companyId: 7, number: "BANK" } } as DiagnosticReadRows["bankAccount"] | null,
    bankTransaction: [bank()], receiptEntry: [{ id: 10, receiptId: 11, account: "BANK", text: "Entry",
      debit: 0, credit: 100, receipt }], financialEvent: [event()], aiDetectedDocument: [document()],
    documentFinancialEvent: [] as DiagnosticReadRows["documentFinancialEvent"][],
    financialEventPayment: [] as DiagnosticReadRows["financialEventPayment"][],
    financialReconciliation: [] as DiagnosticReadRows["financialReconciliation"][],
  };
  const calls: { model: string; method: string; args: unknown }[] = [];
  const db: DiagnosticReadDb = {
    bankAccount: { async findFirst(args) { calls.push({ model: "bankAccount", method: "findFirst", args }); return rows.bankAccount; } },
    bankTransaction: { async findMany(args) {
      calls.push({ model: "bankTransaction", method: "findMany", args });
      return rows.bankTransaction.filter(b => !args.where.bankAccountId || b.bankAccountId === args.where.bankAccountId);
    } },
    receiptEntry: { async findMany(args) { calls.push({ model: "receiptEntry", method: "findMany", args }); return rows.receiptEntry; } },
    financialEvent: { async findMany(args) { calls.push({ model: "financialEvent", method: "findMany", args }); return rows.financialEvent; } },
    aiDetectedDocument: { async findMany(args) { calls.push({ model: "aiDetectedDocument", method: "findMany", args }); return rows.aiDetectedDocument; } },
    documentFinancialEvent: { async findMany(args) { calls.push({ model: "documentFinancialEvent", method: "findMany", args }); return rows.documentFinancialEvent; } },
    financialEventPayment: { async findMany(args) { calls.push({ model: "financialEventPayment", method: "findMany", args }); return rows.financialEventPayment; } },
    financialReconciliation: { async findMany(args) { calls.push({ model: "financialReconciliation", method: "findMany", args }); return rows.financialReconciliation; } },
  };
  return { rows, db, calls };
}
const load = (db: DiagnosticReadDb) => loadBankDiagnosticSource({ companyId: 7, bankAccountId: 8, db,
  snapshotId: "synthetic-loader", capturedAt: day.toISOString() });
async function source(db: DiagnosticReadDb): Promise<BankDiagnosticSource> {
  const result = await load(db);
  if (!result.ok) throw new Error(result.code);
  return result.source;
}
function confirmed(f: ReturnType<typeof fake>) {
  f.rows.bankTransaction[0].status = "RECONCILED";
  f.rows.financialEventPayment.push(payment());
  f.rows.financialReconciliation.push(reconciliation());
}

test("ownership guard is first; valid company/account yields canonical v3 input", async () => {
  const f = fake(); const s = await source(f.db);
  assert.deepEqual(f.calls[0], { model: "bankAccount", method: "findFirst", args: {
    where: { id: 8, companyId: 7 }, select: { id: true, companyId: true, ledgerAccount: { select: { id: true, companyId: true, number: true } } },
  } });
  assert.deepEqual(s.input.account, { id: 8, companyId: 7, ledgerAccountNumber: "BANK" });
  assert.deepEqual(s.issues, []);
});
test("missing and explicitly foreign account fail closed without any inventory reads", async () => {
  for (const account of [null, { ...owner, companyId: 999, ledgerAccount: null }]) {
    const f = fake(); f.rows.bankAccount = account;
    assert.deepEqual(await load(f.db), { ok: false, code: account ? R.TENANT_SCOPE_VIOLATION : "BANK_ACCOUNT_NOT_FOUND" });
    assert.equal(f.calls.length, 1);
  }
});
test("all 331 synthetic bank transactions, including reconciled, zero and invalid amounts, survive", async () => {
  const f = fake(); f.rows.bankTransaction = Array.from({ length: 331 }, (_, i) => bank({
    id: i + 1, status: i % 2 ? "RECONCILED" : "UNRECONCILED", amount: i === 0 ? "invalid" : i === 1 ? "0" : "-100",
  }));
  const s = await source(f.db); const snapshot = buildBankDiagnosticSnapshotFromSource(s);
  assert.equal(s.input.banks.length, 331); assert.equal(snapshot.total.transactionCount, 331);
  assert.equal(snapshot.transactions[1].bank.status, "RECONCILED");
  assert.deepEqual(snapshot.total.amountTotals, { completeness: "PARTIAL", excludedTransactionCount: 1 });
  assert.equal(Object.values(snapshot.overall).reduce((n, b) => n + b.transactionCount, 0), 331);
  assert.equal(Object.values(snapshot.coverage).reduce((n, b) => n + b.transactionCount, 0), 331);
  assert.equal(snapshot.bookingEventMatrix.reduce((n, r) => n + r.bucket.transactionCount, 0), 331);
  assert.equal(snapshot.confirmedCandidateMatrix.reduce((n, r) => n + r.bucket.transactionCount, 0), 331);
});
test("queries retain non-bank ledger bookings and non-APPROVED receipt status", async () => {
  const f = fake(); f.rows.receiptEntry.push({ ...f.rows.receiptEntry[0], id: 12, account: "EXPENSE" },
    { ...f.rows.receiptEntry[0], id: 13, receipt: { ...receipt, status: "PENDING" } });
  const s = await source(f.db); assert.equal(s.input.bookings.rows?.length, 3);
  assert.deepEqual((f.calls.find(c => c.model === "receiptEntry")!.args as { where: unknown }).where, { receipt: { companyId: 7 } });
  const pipeline = buildBankDiagnosticSnapshotFromSource(s).transactions[0].booking.pipeline;
  assert.ok(pipeline.some(p => p.rejectedByPrimaryReason.some(r => r.code === R.BOOKING_ACCOUNT_NOT_SELECTED)));
  assert.ok(pipeline.some(p => p.rejectedByPrimaryReason.some(r => r.code === R.RECEIPT_STATUS_NOT_APPROVED)));
});
test("unsupported type/currency and null amount/date events remain before diagnostic filtering", async () => {
  const f = fake(); f.rows.financialEvent.push(event({ id: 21, eventType: "UNKNOWN", currency: "EUR" }),
    event({ id: 22, amount: null }), event({ id: 23, eventDate: null }));
  const s = await source(f.db); assert.equal(s.input.events.rows?.length, 4);
  assert.deepEqual((f.calls.find(c => c.model === "financialEvent")!.args as { where: unknown }).where, { companyId: 7 });
  assert.equal(buildBankDiagnosticSnapshotFromSource(s).transactions[0].events.eventCountBeforeFilters, 4);
  assert.equal(s.eventStatuses.length, 4);
});
test("source observations break down unsupported document types without changing materialization rules", async () => {
  const f = fake();
  f.rows.aiDetectedDocument[0].documentType = "PAYMENT_NOTICE";
  const snapshot = buildBankDiagnosticSnapshotFromSource(await source(f.db));
  assert.deepEqual(snapshot.source.materializationObservations.unsupportedDocumentTypes, [
    { documentType: "PAYMENT_NOTICE", count: 1 },
  ]);
  assert.deepEqual(snapshot.source.materializationObservations.invoiceLinkCountsNotOne, []);
  assert.equal(snapshot.companyDocumentInventory.documents[0].materialization.reasons[0].code, R.DOCUMENT_TYPE_UNSUPPORTED);
});

test("source observations group zero-INVOICE documents by document type and merchant", async () => {
  const f = fake();
  f.rows.aiDetectedDocument[0].entityLinks = [];
  const snapshot = buildBankDiagnosticSnapshotFromSource(await source(f.db));
  assert.deepEqual(snapshot.source.materializationObservations.invoiceLinkCountsNotOne, [
    { invoiceLinkCount: 0, count: 1 },
  ]);
  assert.deepEqual(snapshot.source.materializationObservations.invoiceLinkZeroContexts, [
    { documentType: "ACCOUNTING_DOCUMENT", merchantName: "Example", count: 1 },
  ]);
});

test("amount-mismatch diagnostics classify only explicit bank flow hints and keep unknowns unknown", async () => {
  const f = fake();
  f.rows.bankTransaction = [
    bank({ id: 1, amount: "-55", text: "Kreditkort", sourceRawData: null }),
    bank({ id: 2, amount: "-56", text: "Merchant", sourceRawData: JSON.stringify({ counterparty: "Merchant ehf", paymentExplanation: "Úttekt með debetkorti", counterpartyKennitala: "1234567890" }) }),
    bank({ id: 3, amount: "-57", text: "Óþekkt", sourceRawData: null }),
    bank({ id: 4, amount: "125000", text: "Example ehf", sourceRawData: JSON.stringify({ counterparty: "Example ehf", counterpartyKennitala: "1234567890" }) }),
  ];
  const snapshot = buildBankDiagnosticSnapshotFromSource(await source(f.db));
  assert.equal(snapshot.source.reconciliationFlowObservations.amountMismatchNoCandidateCount, 4);
  assert.deepEqual(snapshot.source.reconciliationFlowObservations.amountMismatchFlowHints, [
    { flow: "CARD_PURCHASE", count: 1 },
    { flow: "CARD_ACCOUNT_MOVEMENT", count: 1 },
    { flow: "UNKNOWN", count: 2 },
  ]);
});

test("reviewed-document diagnostics expose same-amount documents outside candidate layers", async () => {
  const f = fake();
  f.rows.bankTransaction = [bank({ id: 1, amount: "-125", text: "Example" })];
  f.rows.aiDetectedDocument[0].totalAmount = 125;
  f.rows.aiDetectedDocument[0].entityLinks = [];
  const snapshot = buildBankDiagnosticSnapshotFromSource(await source(f.db));
  const observation = snapshot.source.reviewedDocumentAmountObservations;

  assert.equal(observation.amountMismatchNoCandidateCount, 1);
  assert.equal(observation.reviewedAmountMatchTransactionCount, 1);
  assert.equal(observation.reviewedAmountNearDateTransactionCount, 1);
  assert.equal(observation.reviewedAmountNearDateUniqueTransactionCount, 1);
  assert.equal(observation.reviewedAmountNearDateMultipleTransactionCount, 0);
  assert.equal(observation.noReviewedAmountMatchTransactionCount, 0);
  assert.deepEqual(observation.nearDateStateCounts, [
    { state: "INVOICE_LINK_COUNT_NOT_ONE", count: 1 },
  ]);
  assert.equal(observation.examples?.[0]?.matches[0]?.receiptId, 11);
  assert.equal(observation.examples?.[0]?.matches[0]?.merchantName, "Example");
});

test("source observations expose invoice-link cardinality for exactly-one rejection", async () => {
  const f = fake();
  f.rows.aiDetectedDocument[0].entityLinks = [];
  const snapshot = buildBankDiagnosticSnapshotFromSource(await source(f.db));
  assert.deepEqual(snapshot.source.materializationObservations.unsupportedDocumentTypes, []);
  assert.deepEqual(snapshot.source.materializationObservations.invoiceLinkCountsNotOne, [
    { invoiceLinkCount: 0, count: 1 },
  ]);
  assert.equal(snapshot.companyDocumentInventory.documents[0].materialization.reasons[0].code, R.INVOICE_LINK_COUNT_NOT_ONE);
});
test("foreign nested document/entity information is rejected before DTO and marks partial", async () => {
  const f = fake(); f.rows.aiDetectedDocument[0].entityLinks[0].entity = {
    id: 987654, companyId: 999, entityType: "FOREIGN_PRIVATE", identifierValue: "SECRET_IDENTIFIER",
  };
  const s = await source(f.db); const snapshot = buildBankDiagnosticSnapshotFromSource(s);
  assert.ok(s.issues.some(i => i.code === R.TENANT_SCOPE_VIOLATION));
  assert.equal(snapshot.completeness, "PARTIAL"); assert.equal(snapshot.integrity.state, "ERROR");
  assert.equal(s.input.documents.rows?.length, 0);
  assert.equal(s.input.events.availability, "UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify({ s, snapshot }), /987654|999|FOREIGN_PRIVATE|SECRET_IDENTIFIER/);
});
test("missing local document reference is unresolved, never a tenant allegation", async () => {
  const f = fake(); f.rows.documentFinancialEvent.push({ ...link(), documentId: 987654, document: null });
  const s = await source(f.db); const snapshot = buildBankDiagnosticSnapshotFromSource(s);
  assert.ok(s.issues.some(i => i.code === R.TARGET_REFERENCE_UNRESOLVED));
  assert.ok(!s.issues.some(i => i.code === R.TENANT_SCOPE_VIOLATION));
  assert.equal(snapshot.completeness, "PARTIAL");
  assert.doesNotMatch(JSON.stringify({ s, snapshot }), /987654/);
});
test("explicit foreign document-event target is a tenant violation without target leakage", async () => {
  const f = fake(); f.rows.documentFinancialEvent.push({ ...link(), eventId: 987654, event: { id: 987654, companyId: 999 } });
  const s = await source(f.db);
  assert.ok(s.issues.some(i => i.code === R.TENANT_SCOPE_VIOLATION));
  assert.doesNotMatch(JSON.stringify(s), /987654|999/);
});
test("unlinked materializable document stays only in company inventory", async () => {
  const f = fake(); f.rows.receiptEntry = []; const snapshot = buildBankDiagnosticSnapshotFromSource(await source(f.db));
  assert.equal(snapshot.companyDocumentInventory.documents[0].materialization.eligibility, "ELIGIBLE");
  assert.equal(snapshot.companyDocumentInventory.documents[0].materialization.hasPrimaryEvent, false);
  assert.deepEqual(snapshot.transactions[0].documents.contexts, []);
});
test("receipt-only PRIMARY link never invents a document ID", async () => {
  const f = fake(); f.rows.documentFinancialEvent.push({ ...link(), documentId: null, document: null });
  const snapshot = buildBankDiagnosticSnapshotFromSource(await source(f.db));
  assert.ok(snapshot.transactions[0].documents.contexts.every(c => c.documentId === null));
});
test("existing temporal parser is used only on PRIMARY REVIEWED_DOCUMENT links", async () => {
  const f = fake(); f.rows.documentFinancialEvent.push(link());
  const s = await source(f.db);
  assert.deepEqual(s.input.events.rows?.[0].primarySourceDocumentDates, [day]);
  assert.equal(s.input.events.rows?.[0].sourceDueDate?.toISOString().slice(0, 10), "2026-01-02");
  f.rows.documentFinancialEvent[0].source = "OTHER";
  assert.deepEqual((await source(f.db)).input.events.rows?.[0].primarySourceDocumentDates, []);
});
test("valid confirmed pair is loaded without relying on current candidate matching", async () => {
  const f = fake(); confirmed(f); f.rows.financialEvent[0].eventDate = new Date("2020-01-01");
  const s = await source(f.db); const snapshot = buildBankDiagnosticSnapshotFromSource(s);
  assert.equal(s.input.confirmations.rows?.[0].state, "VALID");
  assert.equal(snapshot.transactions[0].overall.state, "CONFIRMED");
  assert.equal(snapshot.transactions[0].events.candidateCount, 0);
  assert.equal(s.confirmationRecords.length, 2);
  assert.ok(s.confirmationRecords.every(r => r.state === "VALID"));
});
test("malformed participant roles are retained as inconsistent, not silently omitted", async () => {
  const f = fake(); confirmed(f); f.rows.financialReconciliation[0].participants[1].role = "WRONG";
  const s = await source(f.db); const snapshot = buildBankDiagnosticSnapshotFromSource(s);
  assert.equal(s.input.confirmations.rows?.[0].state, "INCONSISTENT");
  assert.equal(snapshot.transactions[0].overall.state, "DATA_CONFLICT");
  assert.ok(s.confirmationRecords[0].reasons.includes(R.RECONCILIATION_PARTICIPANTS_MISMATCH));
  assert.ok(snapshot.transactions[0].documents.contexts.every(c => c.via.kind !== "CONFIRMED_LINK"));
});
test("orphan reconciliation is retained safely with unresolved issue and no unknown target ID", async () => {
  const f = fake(); confirmed(f); f.rows.financialReconciliation[0].participants[1].sourceKey = "987654";
  const s = await source(f.db); const snapshot = buildBankDiagnosticSnapshotFromSource(s);
  assert.equal(s.confirmationRecords[0].target, null);
  assert.ok(s.issues.some(i => i.code === R.TARGET_REFERENCE_UNRESOLVED));
  assert.ok(!s.issues.some(i => i.code === R.TENANT_SCOPE_VIOLATION));
  assert.equal(snapshot.completeness, "PARTIAL");
  assert.doesNotMatch(JSON.stringify({ s, snapshot }), /987654/);
});
test("confirmed payment without reconciliation remains an inconsistent diagnostic link", async () => {
  const f = fake(); f.rows.financialEventPayment.push(payment());
  const s = await source(f.db);
  assert.equal(s.input.confirmations.rows?.[0].reconciliationId, null);
  assert.equal(s.input.confirmations.rows?.[0].state, "INCONSISTENT");
});
test("foreign payment endpoint is redacted; its amount is not included in allocation totals", async () => {
  const f = fake(); f.rows.financialEventPayment.push({ ...payment(), id: 987650, eventId: 987654,
    event: { id: 987654, companyId: 999 }, amount: "12345678" });
  const s = await source(f.db);
  assert.equal(s.confirmationRecords[0].id, null);
  assert.deepEqual(s.confirmationRecords[0].reasons, [R.TENANT_SCOPE_VIOLATION]);
  assert.equal(s.allocations[0].confirmedAmount, null);
  assert.equal(s.allocations[0].overAllocated, null);
  assert.doesNotMatch(JSON.stringify(s), /987650|987654|999|12345678/);
});
test("unsupported reconciliation type remains visible but never produces confirmed document context", async () => {
  const f = fake(); confirmed(f); f.rows.financialReconciliation[0].reconciliationType = "OTHER";
  const s = await source(f.db);
  assert.equal(s.input.confirmations.rows?.[0].state, "UNSUPPORTED_RECORD");
  const snapshot = buildBankDiagnosticSnapshotFromSource(s);
  assert.ok(snapshot.transactions[0].documents.contexts.every(c => c.via.kind !== "CONFIRMED_LINK"));
});
test("event over-allocation includes payments from other company-owned bank accounts", async () => {
  const f = fake(); confirmed(f); f.rows.financialEventPayment.push({ ...payment(), id: 62, bankTransactionId: 2,
    amount: "0.01", bankTransaction: { id: 2, bankAccountId: 18, amount: "-0.01", bankAccount: { id: 18, companyId: 7 } } });
  const s = await source(f.db);
  assert.deepEqual(s.allocations.find(a => a.target.type === "FINANCIAL_EVENT"), {
    target: { type: "FINANCIAL_EVENT", id: 20 }, confirmedAmount: "100.01", capacity: "100", overAllocated: true,
  });
  assert.ok(s.confirmationRecords[0].reasons.includes(R.EVENT_PAYMENT_OVER_ALLOCATION));
  assert.equal(s.input.confirmations.rows?.[0].state, "INCONSISTENT");
});
test("read failures do not become empty complete sources or leak exception contents", async () => {
  const f = fake(); f.db.receiptEntry.findMany = async () => { throw new Error("PRIVATE_DATABASE_DETAILS"); };
  const s = await source(f.db); const snapshot = buildBankDiagnosticSnapshotFromSource(s);
  assert.equal(s.input.bookings.availability, "UNAVAILABLE");
  assert.equal(snapshot.total.transactionCount, 1); assert.equal(snapshot.completeness, "PARTIAL");
  assert.doesNotMatch(JSON.stringify({ s, snapshot }), /PRIVATE_DATABASE_DETAILS/);
  f.db.bankTransaction.findMany = async () => { throw new Error("PRIVATE_DATABASE_DETAILS"); };
  assert.deepEqual(await load(f.db), { ok: false, code: R.SOURCE_UNAVAILABLE });
});
test("read-only fake needs no writes; runtime imports exclude DB and write orchestration", async () => {
  const f = fake(); await source(f.db);
  assert.ok(f.calls.every(c => c.method === "findMany" || c.method === "findFirst"));
  assert.equal(f.calls.length, 8);
  const code = readFileSync(new URL("./diagnostics-source.ts", import.meta.url), "utf8");
  const imports = [...code.matchAll(/^import (?!type\b)[\s\S]*? from "([^"]+)";/gm)].map(m => m[1]);
  assert.deepEqual(imports, ["@prisma/client/runtime/client", "./source-document-temporal", "./diagnostics-contract"]);
  assert.doesNotMatch(code, /app\/actions|from ["']\.\.\/prisma["']|event-confirmation|financial-event-materialization/);
  assert.doesNotMatch(code, /\.(?:create|update|delete|upsert|\$transaction)\s*\(/);
});
test("source feeds v3 unchanged; service preserves every core field and does not mutate input", async () => {
  const f = fake(); const before = structuredClone(f.rows);
  const s = await source(f.db); assert.deepEqual(f.rows, before);
  const sourceBefore = structuredClone(s);
  const { source: facts, ...core } = buildBankDiagnosticSnapshotFromSource(s);
  assert.deepEqual(core, buildBankDiagnostics(s.input));
  assert.equal(core.schemaVersion, DIAGNOSTIC_VERSION);
  assert.equal(facts.readConsistency, "UNCOORDINATED");
  assert.equal(core.consistency, "CALLER_SUPPLIED");
  assert.deepEqual(s, sourceBefore);
});

test("explicit payment account mismatch fails closed even inside the same company", async () => {
  const f = fake(); f.rows.financialEventPayment.push({ ...payment(), bankTransaction: {
    id: 1, bankAccountId: 987654, amount: "-100", bankAccount: { id: 987654, companyId: 7 },
  } });
  const s = await source(f.db);
  assert.deepEqual(s.confirmationRecords[0].reasons, [R.TENANT_SCOPE_VIOLATION]);
  assert.equal(buildBankDiagnosticSnapshotFromSource(s).completeness, "PARTIAL");
  assert.doesNotMatch(JSON.stringify(s), /987654/);
});
test("duplicate confirmed reconciliations cannot assert VALID", async () => {
  const f = fake(); confirmed(f); f.rows.financialReconciliation.push({ ...reconciliation(), id: 63 });
  const s = await source(f.db);
  assert.ok(s.input.confirmations.rows?.every(r => r.state === "INCONSISTENT"));
  assert.ok(s.confirmationRecords.filter(r => r.kind === "RECONCILIATION")
    .every(r => r.reasons.includes(R.AMBIGUOUS_EXISTING_RECONCILIATION)));
});
test("verified reconciliation for another local bank account is not an unresolved or tenant issue", async () => {
  const f = fake(); f.rows.bankTransaction.push(bank({ id: 2, bankAccountId: 18, bankAccount: { id: 18, companyId: 7 } }));
  const r = reconciliation(); r.participants[0].sourceKey = "2"; f.rows.financialReconciliation.push(r);
  const s = await source(f.db);
  assert.equal(s.input.banks.length, 1); assert.deepEqual(s.issues, []);
  assert.deepEqual(s.input.confirmations.rows, []);
  const reads = f.calls.filter(c => c.model === "bankTransaction");
  assert.deepEqual((reads[1].args as { where: unknown }).where, { id: { in: [2] }, bankAccount: { companyId: 7 } });
});
test("missing payment event and empty reconciliation participants remain unresolved, with no target leak", async () => {
  const f = fake(); f.rows.financialEventPayment.push({ ...payment(), eventId: 987654, event: { id: 987654, companyId: 7 } });
  f.rows.financialReconciliation.push({ ...reconciliation(), participants: [] });
  const s = await source(f.db);
  assert.ok(s.confirmationRecords.every(r => r.target === null));
  assert.ok(s.issues.every(i => i.code === R.TARGET_REFERENCE_UNRESOLVED));
  assert.doesNotMatch(JSON.stringify(s), /987654/);
});
test("failed payment read cannot mark a supplied reconciliation VALID or fabricate zero allocation", async () => {
  const f = fake(); confirmed(f); f.db.financialEventPayment.findMany = async () => { throw new Error("unavailable"); };
  const s = await source(f.db);
  assert.equal(s.input.confirmations.availability, "UNAVAILABLE");
  assert.ok(s.allocations.every(a => a.confirmedAmount === null && a.overAllocated === null));
  assert.ok(s.confirmationRecords.every(r => r.state !== "VALID"));
});

for (const unavailable of [true, false]) test(`event reference with inventory ${unavailable ? "UNAVAILABLE" : "AVAILABLE but missing"}`, async () => {
  const f = fake(); confirmed(f);
  f.rows.financialEventPayment[0].eventId = 987654;
  f.rows.financialEventPayment[0].event.id = 987654;
  f.rows.financialReconciliation[0].participants[1].sourceKey = "987654";
  f.rows.documentFinancialEvent.push({ ...link(), eventId: 987654, event: { id: 987654, companyId: 7 } });
  if (unavailable) f.db.financialEvent.findMany = async () => { throw new Error("unavailable"); };
  const s = await source(f.db); const snapshot = buildBankDiagnosticSnapshotFromSource(s);
  const expected = unavailable ? R.SOURCE_UNAVAILABLE : R.TARGET_REFERENCE_UNRESOLVED;
  assert.ok(s.issues.some(i => i.code === expected));
  assert.equal(snapshot.completeness, "PARTIAL");
  assert.ok(s.confirmationRecords.every(r => r.target === null && r.reasons.includes(expected)));
  assert.doesNotMatch(JSON.stringify({ s, snapshot }), /987654/);
  if (unavailable) {
    assert.equal(s.input.confirmations.availability, "UNAVAILABLE");
    assert.doesNotMatch(JSON.stringify({ s, snapshot }), /TARGET_REFERENCE_UNRESOLVED/);
  }
});

test("unavailable document inventory does not turn nested document relations into resolved or missing targets", async () => {
  const f = fake(); f.rows.documentFinancialEvent.push(link());
  f.db.aiDetectedDocument.findMany = async () => { throw new Error("unavailable"); };
  const s = await source(f.db); const snapshot = buildBankDiagnosticSnapshotFromSource(s);
  assert.equal(s.input.documentLinks.rows?.length, 0);
  assert.equal(snapshot.completeness, "PARTIAL");
  assert.ok(s.issues.some(i => i.code === R.SOURCE_UNAVAILABLE));
  assert.doesNotMatch(JSON.stringify({ s, snapshot }), /TARGET_REFERENCE_UNRESOLVED/);
});

test("unavailable booking inventory leaves receipt-entry reconciliation unevaluated and redacted", async () => {
  const f = fake(); const r = reconciliation();
  r.participants[1] = { ...r.participants[1], sourceType: "RECEIPT_ENTRY", sourceKey: "987654" };
  f.rows.financialReconciliation.push(r);
  f.db.receiptEntry.findMany = async () => { throw new Error("unavailable"); };
  const s = await source(f.db); const snapshot = buildBankDiagnosticSnapshotFromSource(s);
  assert.equal(s.input.confirmations.availability, "UNAVAILABLE");
  assert.equal(snapshot.completeness, "PARTIAL");
  assert.deepEqual(s.confirmationRecords[0].reasons, [R.SOURCE_UNAVAILABLE]);
  assert.doesNotMatch(JSON.stringify({ s, snapshot }), /TARGET_REFERENCE_UNRESOLVED|987654/);
});

test("failed secondary bank inventory read does not allege a missing bank reference", async () => {
  const f = fake(); const r = reconciliation(); r.participants[0].sourceKey = "987654";
  f.rows.financialReconciliation.push(r);
  const read = f.db.bankTransaction.findMany;
  f.db.bankTransaction.findMany = args => {
    if (args.where.id) throw new Error("unavailable");
    return read(args);
  };
  const s = await source(f.db); const snapshot = buildBankDiagnosticSnapshotFromSource(s);
  assert.equal(s.input.confirmations.availability, "UNAVAILABLE");
  assert.equal(snapshot.total.transactionCount, 1);
  assert.equal(snapshot.completeness, "PARTIAL");
  assert.deepEqual(s.confirmationRecords[0].reasons, [R.SOURCE_UNAVAILABLE]);
  assert.doesNotMatch(JSON.stringify({ s, snapshot }), /TARGET_REFERENCE_UNRESOLVED|987654/);
});
