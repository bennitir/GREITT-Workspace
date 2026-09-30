import type { Prisma } from "../../app/generated/prisma/client";
import { Decimal } from "@prisma/client/runtime/client";
import { collectSourceDocumentTemporalContext } from "./source-document-temporal";
import { R, type DiagnosticInput, type ReasonCode, type TargetRef } from "./diagnostics-contract";

// Selects are intentionally explicit: no raw OCR, storage, metadata, or full model reads.
const receiptSelect = { id: true, companyId: true, status: true, aiDate: true, date: true,
  merchantName: true, description: true, voucherNumber: true } as const;
const ownerSelect = { id: true, companyId: true } as const;
export const diagnosticSelect = {
  bankAccount: { ...ownerSelect, ledgerAccount: { select: { ...ownerSelect, number: true } } },
  bankTransaction: { id: true, bankAccountId: true, amount: true, date: true, reference: true,
    text: true, status: true, bankAccount: { select: ownerSelect } },
  receiptEntry: { id: true, receiptId: true, account: true, text: true, debit: true, credit: true,
    receipt: { select: receiptSelect } },
  financialEvent: { ...ownerSelect, eventType: true, amount: true, currency: true,
    eventDate: true, externalReference: true, status: true },
  aiDetectedDocument: { id: true, receiptId: true, receipt: { select: receiptSelect },
    date: true, summary: true, documentRole: true, documentType: true, classificationSource: true,
    totalAmount: true, receiptNumber: true, paymentSchedule: true, reviewedAt: true, approvedAt: true,
    bookingEntries: { select: { documentId: true, account: true, text: true, debit: true, credit: true } },
    entityLinks: { select: { receiptId: true, documentId: true, entityId: true,
      receipt: { select: ownerSelect },
      entity: { select: { ...ownerSelect, entityType: true, identifierValue: true } } } } },
  documentFinancialEvent: { id: true, receiptId: true, documentId: true, eventId: true, role: true, source: true,
    receipt: { select: ownerSelect }, event: { select: ownerSelect },
    document: { select: { id: true, receiptId: true, receipt: { select: ownerSelect } } } },
  financialEventPayment: { id: true, eventId: true, bankTransactionId: true, amount: true,
    currency: true, status: true, event: { select: ownerSelect },
    bankTransaction: { select: { id: true, bankAccountId: true, amount: true,
      bankAccount: { select: ownerSelect } } } },
  financialReconciliation: { ...ownerSelect, reconciliationType: true, status: true,
    participants: { select: { sourceType: true, sourceKey: true, role: true, matchedAmount: true } } },
} as const;

// Decimal-shaped values allow ordinary string fixtures; Prisma Decimal also satisfies this interface.
type ReadValue<T> = T extends Prisma.Decimal ? { toString(): string }
  : T extends Date ? Date : T extends readonly (infer V)[] ? ReadValue<V>[]
  : T extends object ? { [K in keyof T]: ReadValue<T[K]> } : T;
export type DiagnosticReadRows = {
  bankAccount: ReadValue<Prisma.BankAccountGetPayload<{ select: typeof diagnosticSelect.bankAccount }>>;
  bankTransaction: ReadValue<Prisma.BankTransactionGetPayload<{ select: typeof diagnosticSelect.bankTransaction }>>;
  receiptEntry: ReadValue<Prisma.ReceiptEntryGetPayload<{ select: typeof diagnosticSelect.receiptEntry }>>;
  financialEvent: ReadValue<Prisma.FinancialEventGetPayload<{ select: typeof diagnosticSelect.financialEvent }>>;
  aiDetectedDocument: ReadValue<Prisma.AiDetectedDocumentGetPayload<{ select: typeof diagnosticSelect.aiDetectedDocument }>>;
  documentFinancialEvent: ReadValue<Prisma.DocumentFinancialEventGetPayload<{ select: typeof diagnosticSelect.documentFinancialEvent }>>;
  financialEventPayment: ReadValue<Prisma.FinancialEventPaymentGetPayload<{ select: typeof diagnosticSelect.financialEventPayment }>>;
  financialReconciliation: ReadValue<Prisma.FinancialReconciliationGetPayload<{ select: typeof diagnosticSelect.financialReconciliation }>>;
};
type Where = {
  bankTransaction: Prisma.BankTransactionWhereInput; receiptEntry: Prisma.ReceiptEntryWhereInput;
  financialEvent: Prisma.FinancialEventWhereInput; aiDetectedDocument: Prisma.AiDetectedDocumentWhereInput;
  documentFinancialEvent: Prisma.DocumentFinancialEventWhereInput; financialEventPayment: Prisma.FinancialEventPaymentWhereInput;
  financialReconciliation: Prisma.FinancialReconciliationWhereInput;
};
export type DiagnosticReadDb = {
  bankAccount: { findFirst(args: { where: { id: number; companyId: number };
    select: typeof diagnosticSelect.bankAccount }): Promise<DiagnosticReadRows["bankAccount"] | null> };
} & { [K in keyof Where]: { findMany(args: { where: Where[K]; select: typeof diagnosticSelect[K];
  orderBy: { id: "asc" } }): Promise<DiagnosticReadRows[K][]> } };

/** Future adapter may supply a transaction-scoped set of read delegates here.
 * This module neither opens a transaction nor claims snapshot isolation. */
export type DiagnosticReadScope = <T>(read: (db: DiagnosticReadDb) => Promise<T>) => Promise<T>;
export type SourceIssue = { source: keyof DiagnosticReadRows; code: ReasonCode };
export type ConfirmationRecord = {
  kind: "PAYMENT" | "RECONCILIATION";
  id: number | null; bankTransactionId: number | null; target: TargetRef | null;
  state: "VALID" | "INCONSISTENT" | "UNSUPPORTED_RECORD";
  reasons: ReasonCode[];
};
export type AllocationFact = {
  target: { type: "BANK_TRANSACTION" | "FINANCIAL_EVENT"; id: number };
  confirmedAmount: string | null; capacity: string | null; overAllocated: boolean | null;
};
export type BankDiagnosticSource = {
  input: DiagnosticInput;
  // Independent reads are explicitly not a consistent database snapshot.
  readConsistency: "UNCOORDINATED";
  issues: SourceIssue[];
  confirmationRecords: ConfirmationRecord[];
  allocations: AllocationFact[];
  eventStatuses: { eventId: number; status: string }[];
};
export type BankDiagnosticSourceResult = { ok: true; source: BankDiagnosticSource }
  | { ok: false; code: "BANK_ACCOUNT_NOT_FOUND" | "INVALID_SCOPE" | "SOURCE_UNAVAILABLE" | "TENANT_SCOPE_VIOLATION" };

const id = (key: string) => /^[1-9]\d*$/.test(key) && Number.isSafeInteger(Number(key)) ? Number(key) : null;
function amount(value: { toString(): string } | null) {
  if (value === null) return null;
  try { const n = new Decimal(value.toString()); return n.isFinite() ? n : null; } catch { return null; }
}

/** The caller authorizes companyId. Only injected read delegates are used; no default DB connection. */
export async function loadBankDiagnosticSource(args: {
  companyId: number; bankAccountId: number; db: DiagnosticReadDb;
  snapshotId: string; capturedAt: string;
}): Promise<BankDiagnosticSourceResult> {
  const { companyId, bankAccountId, db } = args;
  if (![companyId, bankAccountId].every(n => Number.isSafeInteger(n) && n > 0)) return { ok: false, code: "INVALID_SCOPE" };
  let account: DiagnosticReadRows["bankAccount"] | null;
  try { account = await db.bankAccount.findFirst({ where: { id: bankAccountId, companyId }, select: diagnosticSelect.bankAccount }); }
  catch { return { ok: false, code: "SOURCE_UNAVAILABLE" }; }
  if (!account) return { ok: false, code: "BANK_ACCOUNT_NOT_FOUND" };
  if (account.id !== bankAccountId || account.companyId !== companyId) return { ok: false, code: R.TENANT_SCOPE_VIOLATION };

  const issues: SourceIssue[] = [];
  function issue(source: SourceIssue["source"], code: ReasonCode) {
    if (!issues.some(i => i.source === source && i.code === code)) issues.push({ source, code });
    return false;
  }
  function owned(source: SourceIssue["source"], row: { companyId: number } | null | undefined) {
    return row ? row.companyId === companyId || issue(source, R.TENANT_SCOPE_VIOLATION)
      : issue(source, R.TARGET_REFERENCE_UNRESOLVED);
  }
  const failed = new Set<keyof Where>();
  // An unread inventory cannot establish that a reference is absent.
  function referenceFailure(inventory: keyof Where) {
    return failed.has(inventory) ? R.SOURCE_UNAVAILABLE : R.TARGET_REFERENCE_UNRESOLVED;
  }
  async function read<K extends keyof Where>(model: K, where: Where[K]): Promise<DiagnosticReadRows[K][]> {
    try {
      // The mapped delegate's input/output stay correlated through K.
      const delegate = db[model] as { findMany(args: { where: Where[K]; select: typeof diagnosticSelect[K];
        orderBy: { id: "asc" } }): Promise<DiagnosticReadRows[K][]> };
      return await delegate.findMany({ where, select: diagnosticSelect[model], orderBy: { id: "asc" } });
    } catch { failed.add(model); issue(model, R.SOURCE_UNAVAILABLE); return []; }
  }
  const [bankRows, bookingRows, eventRows, documentRows, linkRows, paymentRows, reconciliationRows] = await Promise.all([
    read("bankTransaction", { bankAccountId }),
    read("receiptEntry", { receipt: { companyId } }),
    read("financialEvent", { companyId }),
    read("aiDetectedDocument", { receipt: { companyId } }),
    read("documentFinancialEvent", { OR: [{ receipt: { companyId } }, { event: { companyId } }] }),
    read("financialEventPayment", { OR: [{ event: { companyId } }, { bankTransaction: { bankAccountId } }] }),
    read("financialReconciliation", { companyId }),
  ]);
  // Without the bank inventory a transactionCount of zero would be a false total.
  if (failed.has("bankTransaction")) return { ok: false, code: R.SOURCE_UNAVAILABLE };
  const banks = bankRows.filter(b => owned("bankTransaction", b.bankAccount) &&
    (b.bankAccountId === bankAccountId && b.bankAccount.id === bankAccountId || issue("bankTransaction", R.TENANT_SCOPE_VIOLATION)));
  const bankMap = new Map(banks.map(b => [b.id, b]));
  const bookings = bookingRows.filter(b => owned("receiptEntry", b.receipt) &&
    (b.receiptId === b.receipt.id || issue("receiptEntry", R.TARGET_REFERENCE_UNRESOLVED)));
  const events = eventRows.filter(e => owned("financialEvent", e));
  const eventMap = new Map(events.map(e => [e.id, e]));
  const bookingIds = new Set(bookings.map(b => b.id));
  const documents = documentRows.filter(d => {
    if (!owned("aiDetectedDocument", d.receipt)) return false;
    if (d.receiptId !== d.receipt.id) return issue("aiDetectedDocument", R.TARGET_REFERENCE_UNRESOLVED);
    // Reject the entire document, rather than making eligibility true by removing a bad link.
    let valid = true;
    for (const entry of d.bookingEntries) if (entry.documentId !== d.id) {
      issue("aiDetectedDocument", R.TARGET_REFERENCE_UNRESOLVED); valid = false;
    }
    for (const link of d.entityLinks) {
      const receiptOwned = owned("aiDetectedDocument", link.receipt);
      const entityOwned = owned("aiDetectedDocument", link.entity);
      if (!receiptOwned || !entityOwned) { valid = false; continue; }
      if (link.receiptId !== d.receiptId || link.receipt.id !== d.receiptId || link.documentId !== d.id || link.entityId !== link.entity.id) {
        issue("aiDetectedDocument", R.TARGET_REFERENCE_UNRESOLVED); valid = false;
      }
    }
    return valid;
  });
  const documentMap = new Map(documents.map(d => [d.id, d]));
  const links = linkRows.filter(l => {
    const receiptOwned = owned("documentFinancialEvent", l.receipt);
    const eventOwned = owned("documentFinancialEvent", l.event);
    const documentOwned = l.documentId === null || owned("documentFinancialEvent", l.document?.receipt);
    if (!receiptOwned || !eventOwned || !documentOwned) return false;
    if (failed.has("financialEvent") || l.documentId !== null && failed.has("aiDetectedDocument")) {
      return issue("documentFinancialEvent", R.SOURCE_UNAVAILABLE);
    }
    return (l.receiptId === l.receipt.id && l.eventId === l.event.id && eventMap.has(l.eventId) &&
      (l.documentId === null ? l.document === null : l.document?.id === l.documentId &&
        l.document.receiptId === l.receiptId && l.document.receipt.id === l.receiptId && documentMap.has(l.documentId))) ||
      issue("documentFinancialEvent", R.TARGET_REFERENCE_UNRESOLVED);
  });

  // Resolve participant bank IDs only inside the requested company, never by a global ID lookup.
  const otherBankIds = [...new Set(reconciliationRows.filter(r => r.companyId === companyId)
    .flatMap(r => r.participants.filter(p => p.sourceType === "BANK_TRANSACTION").map(p => id(p.sourceKey)))
    .filter((n): n is number => n !== null && !bankMap.has(n)))];
  const otherBanks = otherBankIds.length ? await read("bankTransaction", { id: { in: otherBankIds }, bankAccount: { companyId } }) : [];
  const ownedBankIds = new Set(banks.map(b => b.id));
  for (const b of otherBanks) if (owned("bankTransaction", b.bankAccount) &&
    (b.bankAccountId === b.bankAccount.id || issue("bankTransaction", R.TENANT_SCOPE_VIOLATION))) ownedBankIds.add(b.id);

  const records: ConfirmationRecord[] = [];
  const payments = paymentRows.filter(p => {
    const eventOwned = owned("financialEventPayment", p.event);
    const bankOwned = owned("financialEventPayment", p.bankTransaction?.bankAccount);
    const accountMismatch = bankOwned && (p.bankTransaction.bankAccountId !== p.bankTransaction.bankAccount.id ||
      bankMap.has(p.bankTransactionId) && p.bankTransaction.bankAccountId !== bankAccountId);
    const referencesValid = eventOwned && bankOwned && !accountMismatch && p.eventId === p.event.id && eventMap.has(p.eventId) &&
      p.bankTransactionId === p.bankTransaction.id && p.bankTransaction.bankAccountId === p.bankTransaction.bankAccount.id;
    if (referencesValid) return true;
    const code = accountMismatch ? R.TENANT_SCOPE_VIOLATION : !eventOwned || !bankOwned ?
      (p.event && p.event.companyId !== companyId || p.bankTransaction?.bankAccount && p.bankTransaction.bankAccount.companyId !== companyId
        ? R.TENANT_SCOPE_VIOLATION : R.TARGET_REFERENCE_UNRESOLVED)
      : p.eventId === p.event.id && p.bankTransactionId === p.bankTransaction.id
        ? referenceFailure("financialEvent") : R.TARGET_REFERENCE_UNRESOLVED;
    issue("financialEventPayment", code);
    records.push({ kind: "PAYMENT", id: null, bankTransactionId: null, target: null, state: "INCONSISTENT", reasons: [code] });
    return false;
  });
  const allocations: AllocationFact[] = [];
  function allocation(target: AllocationFact["target"], capacityValue: { toString(): string } | null, rows: typeof payments, currency?: string) {
    const capacity = amount(capacityValue)?.abs() ?? null;
    const values = rows.filter(p => p.status === "CONFIRMED").map(p => currency && p.currency !== currency ? null : amount(p.amount));
    const complete = !failed.has("financialEventPayment") && !issues.some(i => i.source === "financialEventPayment") &&
      values.every(v => v !== null && v.gte(0));
    const sum = complete ? values.reduce<Decimal>((a, b) => a.plus(b!), new Decimal(0)) : null;
    const fact: AllocationFact = { target, confirmedAmount: sum?.toString() ?? null, capacity: capacity?.toString() ?? null,
      overAllocated: sum && capacity ? sum.gt(capacity) : null };
    allocations.push(fact); return fact;
  }
  for (const b of banks) allocation({ type: "BANK_TRANSACTION", id: b.id }, b.amount,
    payments.filter(p => p.bankTransactionId === b.id), "ISK");
  for (const e of events) allocation({ type: "FINANCIAL_EVENT", id: e.id }, e.amount,
    payments.filter(p => p.eventId === e.id), e.currency);

  const confirmations: Extract<DiagnosticInput["confirmations"], { availability: "AVAILABLE" }>["rows"][number][] = [];
  const reconciliations = reconciliationRows.filter(r => owned("financialReconciliation", r));
  const usedPayments = new Set<number>();
  for (const r of reconciliations) {
    // All company records are inspected, including orphan/unsupported records with no bank participant.
    const bp = r.participants.filter(p => p.sourceType === "BANK_TRANSACTION");
    const tp = r.participants.filter(p => p.sourceType === "FINANCIAL_EVENT" || p.sourceType === "RECEIPT_ENTRY");
    const bankId = bp.length === 1 ? id(bp[0].sourceKey) : null;
    const targetId = tp.length === 1 ? id(tp[0].sourceKey) : null;
    const target: TargetRef | null = targetId !== null && (tp[0].sourceType === "FINANCIAL_EVENT" ? eventMap.has(targetId) : bookingIds.has(targetId))
      ? { type: tp[0].sourceType as TargetRef["type"], id: targetId } : null;
    const unresolved = bankId === null || !ownedBankIds.has(bankId) || !target;
    if (unresolved) {
      const code = bankId !== null && !ownedBankIds.has(bankId) && failed.has("bankTransaction") ||
        targetId !== null && failed.has(tp[0].sourceType === "FINANCIAL_EVENT" ? "financialEvent" : "receiptEntry")
        ? R.SOURCE_UNAVAILABLE : R.TARGET_REFERENCE_UNRESOLVED;
      issue("financialReconciliation", code);
      records.push({ kind: "RECONCILIATION", id: r.id, bankTransactionId: bankId !== null && bankMap.has(bankId) ? bankId : null,
        target: null, state: "INCONSISTENT", reasons: [code] });
      continue;
    }
    if (!bankMap.has(bankId)) continue; // Verified local record for a different bank account.
    const pairPayments = payments.filter(p => p.bankTransactionId === bankId && target.type === "FINANCIAL_EVENT" && p.eventId === target.id);
    const p = pairPayments.length === 1 ? pairPayments[0] : null;
    pairPayments.forEach(p => usedPayments.add(p.id));
    const reasons: ReasonCode[] = [];
    const supported = r.reconciliationType === "BANK_TO_FINANCIAL_EVENT" && target.type === "FINANCIAL_EVENT";
    const bankAmount = amount(bankMap.get(bankId)!.amount)?.abs();
    const paymentAmount = p ? amount(p.amount) : null;
    const duplicates = reconciliations.filter(other => other.status === "CONFIRMED" && other.participants.some(part =>
      part.sourceType === "BANK_TRANSACTION" && id(part.sourceKey) === bankId));
    if (!supported) reasons.push(R.RECONCILIATION_TYPE_NOT_VALIDATED);
    else {
      if (r.participants.length !== 2 || bp[0].role !== "MONEY_MOVEMENT" || tp[0].role !== "OBLIGATION" ||
        !bankAmount || !r.participants.every(part => amount(part.matchedAmount)?.eq(bankAmount))) reasons.push(R.RECONCILIATION_PARTICIPANTS_MISMATCH);
      if (!p || !paymentAmount || !bankAmount || !paymentAmount.eq(bankAmount) || p.currency !== eventMap.get(target.id)?.currency ||
        bankMap.get(bankId)!.status !== "RECONCILED") reasons.push(R.CONFIRMED_PAYMENT_MISMATCH);
      if (r.status !== "CONFIRMED") reasons.push(R.RECONCILIATION_STATUS_NOT_CONFIRMABLE);
      if (p?.status !== "CONFIRMED") reasons.push(R.PAYMENT_STATUS_NOT_CONFIRMABLE);
      if (duplicates.length > 1) reasons.push(R.AMBIGUOUS_EXISTING_RECONCILIATION);
      for (const fact of allocations.filter(a => a.target.type === "BANK_TRANSACTION" ? a.target.id === bankId : a.target.id === target.id)) {
        if (fact.overAllocated === true) reasons.push(fact.target.type === "BANK_TRANSACTION" ? R.BANK_PAYMENT_OVER_ALLOCATION : R.EVENT_PAYMENT_OVER_ALLOCATION);
        if (fact.overAllocated === null) reasons.push(R.SOURCE_NOT_EVALUATED);
      }
    }
    const state = !supported ? "UNSUPPORTED_RECORD" : reasons.length ? "INCONSISTENT" : "VALID";
    records.push({ kind: "RECONCILIATION", id: r.id, bankTransactionId: bankId, target, state, reasons });
    // Proposed/cancelled records are observable preconditions, never supplied confirmed assertions.
    if (r.status === "CONFIRMED") confirmations.push({ companyId, bankAccountId, bankTransactionId: bankId,
      state, reconciliationId: r.id, paymentId: p?.id ?? null, target });
  }
  for (const p of payments.filter(p => bankMap.has(p.bankTransactionId))) {
    const target: TargetRef = { type: "FINANCIAL_EVENT", id: p.eventId };
    const related = records.filter(r => r.kind === "RECONCILIATION" && r.bankTransactionId === p.bankTransactionId && r.target?.id === p.eventId);
    const state = related.length === 1 && related[0].state === "VALID" ? "VALID" : "INCONSISTENT";
    const reasons = state === "VALID" ? [] : [R.CONFIRMED_PAYMENT_MISMATCH];
    records.push({ kind: "PAYMENT", id: p.id, bankTransactionId: p.bankTransactionId, target, state, reasons });
    if (p.status === "CONFIRMED" && !usedPayments.has(p.id)) confirmations.push({ companyId, bankAccountId,
      bankTransactionId: p.bankTransactionId, state: "INCONSISTENT", reconciliationId: null, paymentId: p.id, target });
  }
  const ledger = account.ledgerAccount;
  const ledgerAccountNumber = ledger && owned("bankAccount", ledger) ? ledger.number : null;
  const input: DiagnosticInput = {
    snapshotId: args.snapshotId, capturedAt: args.capturedAt,
    account: { id: bankAccountId, companyId, ledgerAccountNumber },
    banks: banks.map(b => ({ id: b.id, companyId, bankAccountId, amount: b.amount.toString(), date: b.date,
      reference: b.reference, text: b.text, status: b.status, currency: null })),
    bookings: failed.has("receiptEntry") ? { availability: "UNAVAILABLE" } : { availability: "AVAILABLE", rows: bookings.map(b => ({
      companyId, entryId: b.id, receiptId: b.receiptId, receiptStatus: b.receipt.status, account: b.account,
      entryText: b.text, debit: b.debit, credit: b.credit, date: b.receipt.aiDate ?? b.receipt.date,
      partyText: b.receipt.merchantName ?? b.receipt.description, description: b.receipt.description, voucherNumber: b.receipt.voucherNumber,
    })) },
    // Incomplete temporal sources cannot silently turn a previously rejected event into a candidate.
    events: failed.has("financialEvent") || issues.some(i => ["documentFinancialEvent", "aiDetectedDocument"].includes(i.source))
      ? { availability: "UNAVAILABLE" } : { availability: "AVAILABLE", rows: events.map(e => {
        const temporal = collectSourceDocumentTemporalContext(links.filter(l => l.eventId === e.id && l.role === "PRIMARY" &&
          l.source === "REVIEWED_DOCUMENT" && l.documentId !== null).map(l => documentMap.get(l.documentId!)!)
          .map(d => ({ documentDate: d.date, summary: d.summary, bookingEntries: d.bookingEntries })));
        return { id: e.id, companyId, eventType: e.eventType, amount: e.amount?.toString() ?? null,
          currency: e.currency, eventDate: e.eventDate, externalReference: e.externalReference,
          primarySourceDocumentDates: temporal.documentDates, sourceDueDate: temporal.dueDate, sourceFinalDueDate: temporal.finalDueDate };
      }) },
    documents: failed.has("aiDetectedDocument") ? { availability: "UNAVAILABLE" } : { availability: "AVAILABLE", rows: documents.map(d => ({
      id: d.id, companyId, receiptId: d.receiptId, receiptStatus: d.receipt.status, reviewedAt: d.reviewedAt, approvedAt: d.approvedAt,
      documentRole: d.documentRole, documentType: d.documentType, classificationSource: d.classificationSource,
      totalAmount: d.totalAmount, receiptNumber: d.receiptNumber, paymentSchedule: d.paymentSchedule,
      bookingEntries: d.bookingEntries.map(e => ({ account: e.account, text: e.text, debit: e.debit, credit: e.credit })),
      entityLinks: d.entityLinks.map(l => ({ entity: { id: l.entity.id, companyId, entityType: l.entity.entityType, identifierValue: l.entity.identifierValue } })),
    })) },
    documentLinks: failed.has("documentFinancialEvent") ? { availability: "UNAVAILABLE" } : { availability: "AVAILABLE", rows: links
      .filter(l => l.role === "PRIMARY").map(l => ({ role: "PRIMARY", companyId, receiptId: l.receiptId, documentId: l.documentId, eventId: l.eventId })) },
    confirmations: failed.has("financialEventPayment") || failed.has("financialReconciliation") || failed.has("financialEvent") ||
      failed.has("receiptEntry") || failed.has("bankTransaction") || failed.has("aiDetectedDocument") || failed.has("documentFinancialEvent")
      ? { availability: "UNAVAILABLE" } : { availability: "AVAILABLE", rows: confirmations },
  };
  return { ok: true, source: { input, readConsistency: "UNCOORDINATED", issues, confirmationRecords: records, allocations,
    eventStatuses: events.map(e => ({ eventId: e.id, status: e.status })) } };
}
