import 'server-only';

import { prisma } from '@/lib/prisma';

/** Confirmed older bank-to-document reconciliations, displayed read-only.
 * The legacy participant role has not always used the current naming convention;
 * source type + key and the CONFIRMED parent record are the identity evidence.
 * Never infer a link from merchant, date or amount.
 */
export type ExistingConfirmedBankDocument = {
  documentId: number;
  receiptId: number | null;
  merchantName: string | null;
  amount: string | null;
  sourceMissing: boolean;
};

export type ExistingConfirmedBankReconciliation = {
  id: number;
  bankTransactionId: number;
  type: string;
  confirmedAt: string | null;
  confirmedByUserId: number | null;
  documents: ExistingConfirmedBankDocument[];
};

export type ExistingConfirmedBankRead = {
  ok: boolean;
  reconciliations: ExistingConfirmedBankReconciliation[];
};

export async function getExistingConfirmedBankDocuments(
  companyId: number,
  bankAccountId: number,
  visibleBankTransactionIds: readonly number[],
): Promise<ExistingConfirmedBankRead> {
  if (![companyId, bankAccountId].every(value => Number.isSafeInteger(value) && value > 0)) {
    return { ok: false, reconciliations: [] };
  }
  const ids = [...new Set(visibleBankTransactionIds)];
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0)) return { ok: false, reconciliations: [] };
  if (ids.length === 0) return { ok: true, reconciliations: [] };

  try {
    // Do not trust ids supplied to the reader: recheck active company/account.
    const bankRows = await prisma.bankTransaction.findMany({
      where: { id: { in: ids }, bankAccountId, bankAccount: { companyId, isActive: true } },
      select: { id: true },
    });
    const authorizedIds = new Set(bankRows.map(row => row.id));
    if (!authorizedIds.size) return { ok: true, reconciliations: [] };
    const bankKeys = [...authorizedIds].map(String);

    const confirmed = await prisma.financialReconciliation.findMany({
      where: {
        companyId,
        status: 'CONFIRMED',
        reconciliationType: 'BANK_TO_REVIEWED_DOCUMENT',
        participants: {
          some: { sourceType: 'BANK_TRANSACTION', sourceKey: { in: bankKeys } },
        },
      },
      select: {
        id: true, reconciliationType: true, confirmedAt: true, confirmedByUserId: true,
        participants: { select: { sourceType: true, sourceKey: true } },
      },
      orderBy: [{ id: 'asc' }],
    });

    // Only actual canonical document participants, never heuristic suggestions.
    const docIds = new Set<number>();
    for (const record of confirmed) for (const participant of record.participants) {
      if (participant.sourceType !== 'AI_DETECTED_DOCUMENT') continue;
      const id = Number(participant.sourceKey);
      if (Number.isSafeInteger(id) && id > 0 && String(id) === participant.sourceKey) docIds.add(id);
    }
    const docs = docIds.size ? await prisma.aiDetectedDocument.findMany({
      where: { id: { in: [...docIds] }, receipt: { companyId } },
      select: {
        id: true, receiptId: true, merchantName: true, totalAmount: true,
        receipt: { select: { merchantName: true } },
      },
    }) : [];
    const docById = new Map(docs.map(doc => [doc.id, doc]));

    const result: ExistingConfirmedBankReconciliation[] = [];
    for (const record of confirmed) {
      const relatedBanks = [...new Set(record.participants
        .filter(participant => participant.sourceType === 'BANK_TRANSACTION')
        .map(participant => Number(participant.sourceKey))
        .filter(id => Number.isSafeInteger(id) && authorizedIds.has(id)))];
      const relatedDocs = [...new Set(record.participants
        .filter(participant => participant.sourceType === 'AI_DETECTED_DOCUMENT')
        .map(participant => Number(participant.sourceKey))
        .filter(id => Number.isSafeInteger(id) && id > 0))];
      const documents = relatedDocs.map(documentId => {
        const doc = docById.get(documentId);
        return {
          documentId,
          receiptId: doc?.receiptId ?? null,
          merchantName: doc?.merchantName ?? doc?.receipt.merchantName ?? null,
          amount: doc?.totalAmount === null || doc?.totalAmount === undefined ? null : String(doc.totalAmount),
          sourceMissing: !doc,
        };
      });
      for (const bankTransactionId of relatedBanks) result.push({
        id: record.id,
        bankTransactionId,
        type: record.reconciliationType,
        confirmedAt: record.confirmedAt?.toISOString() ?? null,
        confirmedByUserId: record.confirmedByUserId,
        documents,
      });
    }
    return { ok: true, reconciliations: result };
  } catch {
    // Never turn unavailable historical evidence into a negative confirmation.
    return { ok: false, reconciliations: [] };
  }
}
