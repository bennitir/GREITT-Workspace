import { classifyHistoryEvidence, type EvidenceKind } from "../personal-finance/person-history-review";
import { findVehicleLoanDocumentMentions } from "../vehicle/loan-document-evidence";

export type EvidenceDocument = { id: number; receiptId: number; summary: string };
export type EvidenceBank = {
  id: number; bankAccountId: number; date: Date; amountRaw: string; text: string | null;
  reference: string | null; status: string; bankAccountName: string;
};
export type EvidenceLoan = { id: number; name: string; identifierValue: string | null };
export type DocumentLead = EvidenceDocument & {
  kinds: EvidenceKind[];
  loanLeads: Array<{ id: number; name: string; identifierValue: string | null; ambiguous: boolean }>;
};
export type BankLead = EvidenceBank & { kinds: EvidenceKind[] };

/** Read-only composition. Caller MUST authorize and company-scope every source. */
export function buildVehicleEvidenceReview(
  plate: string, documents: readonly EvidenceDocument[],
  banks: readonly EvidenceBank[], loans: readonly EvidenceLoan[],
): { documents: DocumentLead[]; bankLines: BankLead[] } {
  const docs: DocumentLead[] = documents.flatMap(doc => {
    if (!Number.isSafeInteger(doc.id) || doc.id <= 0 ||
        !Number.isSafeInteger(doc.receiptId) || doc.receiptId <= 0) return [];
    const kinds = classifyHistoryEvidence({ text: doc.summary }, "", plate);
    return kinds.includes("PLATE") ? [{ ...doc, kinds, loanLeads: [] }] : [];
  });
  const matches = findVehicleLoanDocumentMentions(docs, [...loans], plate);
  const byDoc = new Map<number, DocumentLead["loanLeads"]>();
  for (const loan of loans) for (const hit of matches.get(loan.id) ?? []) {
    const current = byDoc.get(hit.documentId) ?? [];
    current.push({ id: loan.id, name: loan.name, identifierValue: loan.identifierValue,
      ambiguous: hit.multipleLoans });
    byDoc.set(hit.documentId, current);
  }
  for (const doc of docs) doc.loanLeads = byDoc.get(doc.id) ?? [];
  const bankLines: BankLead[] = banks.flatMap(row => {
    if (!Number.isSafeInteger(row.id) || row.id <= 0) return [];
    const kinds = classifyHistoryEvidence(
      { text: row.text, reference: row.reference }, "", plate);
    return kinds.includes("PLATE") ? [{ ...row, kinds }] : [];
  });
  return { documents: docs, bankLines };
}
