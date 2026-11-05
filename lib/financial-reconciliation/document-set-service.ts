import 'server-only';

import { Prisma } from '@/app/generated/prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Human-confirmed one bank transfer -> many already-reviewed source documents.
 * No ReceiptEntry, booking, FinancialEvent or AI writes are made here.
 * The existing FinancialReconciliation tables are the canonical durable record.
 */
const RECONCILIATION_TYPE = 'BANK_TO_DOCUMENT_SET';
const BANK_SOURCE = 'BANK_TRANSACTION';
const DOCUMENT_SOURCE = 'AI_DETECTED_DOCUMENT';
const VERSION = 'visual-document-set-v1';

/** Retain the confirmed, human-reviewed content even if a document is edited later.
 * Older reconciliations without the snapshot still display their existing data.
 * Never infer an unchanged document from a missing content-revision marker.
 */
function confirmedDocumentSnapshots(metadata: unknown): Map<number, {
  documentId: number; receiptId: number; amount: string;
  merchantName: string | null; title: string | null; receiptFileHash: string | null; contentRevision: number;
}> {
  const snapshots = new Map<number, {
    documentId: number; receiptId: number; amount: string;
    merchantName: string | null; title: string | null; receiptFileHash: string | null; contentRevision: number;
  }>();
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return snapshots;
  const raw = (metadata as Record<string, unknown>).documents;
  if (!Array.isArray(raw)) return snapshots;
  for (const value of raw) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const doc = value as Record<string, unknown>;
    if (typeof doc.documentId !== 'number' || !Number.isSafeInteger(doc.documentId) || doc.documentId <= 0 ||
        typeof doc.receiptId !== 'number' || !Number.isSafeInteger(doc.receiptId) || doc.receiptId <= 0 ||
        typeof doc.contentRevision !== 'number' || !Number.isSafeInteger(doc.contentRevision) || doc.contentRevision < 1 ||
        typeof doc.amount !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(doc.amount) ||
        !(doc.merchantName === null || typeof doc.merchantName === 'string' || doc.merchantName === undefined) ||
        !(doc.title === null || typeof doc.title === 'string' || doc.title === undefined) ||
        !(doc.receiptFileHash === null || typeof doc.receiptFileHash === 'string' || doc.receiptFileHash === undefined)) continue;
    snapshots.set(doc.documentId, {
      documentId: doc.documentId, receiptId: doc.receiptId, amount: doc.amount,
      merchantName: typeof doc.merchantName === 'string' ? doc.merchantName : null,
      title: typeof doc.title === 'string' ? doc.title : null,
      receiptFileHash: typeof doc.receiptFileHash === 'string' ? doc.receiptFileHash : null,
      contentRevision: doc.contentRevision,
    });
  }
  return snapshots;
}

export type SavedDocumentSet = {
  id: number;
  bankTransactionId: number;
  status: 'CONFIRMED' | 'VOID';
  documentIds: number[];
  confirmedAt: string;
  confirmedByUserId: number | null;
  voidedAt: string | null;
  voidReason: string | null;
  documents: Array<{
    documentId: number; receiptId: number; title: string; amount: string;
    /** A document may be edited after reconciliation. The confirmed snapshot remains canonical. */
    changedSinceConfirmation: boolean;
    sourceMissing: boolean;
  }>;
};

function requirePositiveInteger(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('SAMSTAEDA_OGILT_AUDKENNI');
}

export function canonicalDocumentIds(values: readonly number[]): number[] {
  if (!Array.isArray(values) || values.length === 0 || values.length > 50) {
    throw new Error('SAMSTAEDA_FJOLDI_SKJALA');
  }
  values.forEach(requirePositiveInteger);
  const unique = [...new Set(values)];
  if (unique.length !== values.length) throw new Error('SAMSTAEDA_TVITEKIN_SKJOL');
  return unique.sort((a, b) => a - b);
}

// Deliberately isolated from the visual view itself. Neither a browser prop nor
// an arbitrary substring in DATABASE_URL can enable a database write.
// Production activation needs a separate, reviewed release; it is *not* enabled
// by this development switch.
export const documentSetStorageEnabled = (env: Readonly<Record<string, string | undefined>> = process.env): boolean => {
  if (env.GLOGGT_DOCUMENT_SET_CONFIRM_ENABLED !== 'true' || env.VERCEL_ENV === 'production') return false;
  const raw = env.DATABASE_URL;
  if (!raw) return false;
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.username || !url.password ||
      url.hash || url.searchParams.has('host') || url.searchParams.has('hostaddr') ||
      url.searchParams.has('service') || url.searchParams.has('options')) return false;
  let database: string;
  let username: string;
  try {
    database = decodeURIComponent(url.pathname.slice(1));
    username = decodeURIComponent(url.username);
  } catch { return false; }
  const host = url.hostname.toLowerCase();
  const ref = 'rfvuzcchsaamrykpdiqm';
  const testDirect = host === `db.${ref}.supabase.co` &&
    username === 'gloggt_preview_runtime' && (!url.port || url.port === '5432');
  const testPooler = host === 'aws-0-eu-west-1.pooler.supabase.com' &&
    username === `gloggt_preview_runtime.${ref}` && ['5432', '6543'].includes(url.port);
  if ((testDirect || testPooler) && database === 'postgres' &&
      ['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '') &&
      (!env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL === `https://${ref}.supabase.co`)) return true;

  // Only a *separately named* local test database, never an arbitrary local DB.
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(host);
  return env.GLOGGT_DOCUMENT_SET_ISOLATED_LOCAL === 'true' && localHost &&
    /^\d+$/.test(url.port) && Number(url.port) > 0 &&
    ['gloggt_document_set_test', 'gloggt_test'].includes(database) &&
    (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_URL.includes('wjobcdjhqjirgyfbeuze'));
};

/** One company and bank account only, including voided history for audit visibility.
 * The page must authorize the company before requesting this read.
 */
export async function getDocumentSetsWithHistory(companyId: number, bankAccountId: number): Promise<SavedDocumentSet[]> {
  requirePositiveInteger(companyId);
  requirePositiveInteger(bankAccountId);
  const account = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, companyId, isActive: true }, select: { id: true },
  });
  if (!account) return [];
  const bankIds = (await prisma.bankTransaction.findMany({
    where: { bankAccountId }, select: { id: true },
  })).map(row => String(row.id));
  if (!bankIds.length) return [];
  const groups = await prisma.financialReconciliation.findMany({
    where: {
      companyId, reconciliationType: RECONCILIATION_TYPE, status: { in: ['CONFIRMED', 'VOID'] },
      participants: { some: { sourceType: BANK_SOURCE, role: 'MONEY_MOVEMENT', sourceKey: { in: bankIds } } },
    },
    select: {
      id: true, status: true, confirmedAt: true, confirmedByUserId: true, metadata: true,
      participants: { select: { sourceType: true, sourceKey: true, role: true, matchedAmount: true } },
    },
    orderBy: { id: 'desc' },
  });
  if (!groups.length) return [];
  const documentIds = [...new Set(groups.flatMap(group => group.participants
    .filter(p => p.sourceType === DOCUMENT_SOURCE && p.role === 'EVIDENCE')
    .map(p => Number(p.sourceKey))))];
  const [docs, voidEvents] = await Promise.all([
    documentIds.length ? prisma.aiDetectedDocument.findMany({
      where: { id: { in: documentIds }, receipt: { companyId } },
      select: { id: true, receiptId: true, merchantName: true, totalAmount: true, contentRevision: true, receipt: { select: { description: true, fileHash: true } } },
    }) : Promise.resolve([]),
    prisma.auditEvent.findMany({
      where: { companyId, entityType: 'FinancialReconciliation', action: 'VOID_BANK_TO_DOCUMENT_SET',
        entityId: { in: groups.filter(group => group.status === 'VOID').map(group => group.id) } },
      select: { entityId: true, createdAt: true, description: true },
      orderBy: { id: 'desc' },
    }),
  ]);
  const byId = new Map(docs.map(doc => [doc.id, doc]));
  const voidById = new Map(voidEvents.map(event => [event.entityId, event]));
  const currentBankIds = new Set(bankIds);
  return groups.flatMap(group => {
    const bank = group.participants.find(p => p.sourceType === BANK_SOURCE && p.role === 'MONEY_MOVEMENT');
    if (!bank || !currentBankIds.has(bank.sourceKey)) return [];
    const sources = group.participants.filter(p => p.sourceType === DOCUMENT_SOURCE && p.role === 'EVIDENCE');
    const voidEvent = voidById.get(group.id);
    const snapshots = confirmedDocumentSnapshots(group.metadata);
    return [{
      id: group.id, bankTransactionId: Number(bank.sourceKey),
      status: group.status === 'CONFIRMED' ? 'CONFIRMED' as const : 'VOID' as const,
      confirmedAt: group.confirmedAt?.toISOString() ?? '',
      confirmedByUserId: group.confirmedByUserId,
      voidedAt: voidEvent?.createdAt.toISOString() ?? null,
      voidReason: voidEvent?.description ?? null,
      documentIds: sources.map(row => Number(row.sourceKey)),
      documents: sources.map(row => {
        const documentId = Number(row.sourceKey);
        const doc = byId.get(documentId);
        const snapshot = snapshots.get(documentId);
        return {
          documentId,
          receiptId: snapshot?.receiptId ?? doc?.receiptId ?? 0,
          title: snapshot?.title ?? snapshot?.merchantName ?? doc?.merchantName ?? doc?.receipt.description ?? 'Skjal ekki lengur tiltækt',
          amount: snapshot?.amount ?? row.matchedAmount.toString(),
          sourceMissing: !doc,
          changedSinceConfirmation: Boolean(snapshot && doc && (snapshot.contentRevision !== doc.contentRevision ||
            (snapshot.receiptFileHash !== null && snapshot.receiptFileHash !== doc.receipt.fileHash))),
        };
      }),
    }];
  });
}

type ConfirmationInput = {
  companyId: number; userId: number; bankAccountId: number;
  bankTransactionId: number; documentIds: readonly number[];
};

/** No write is possible until expressly enabled for a safe, authorized environment. */
export async function confirmVisualDocumentSet(input: ConfirmationInput) {
  if (!documentSetStorageEnabled()) throw new Error('SAMSTAEDA_VISTUN_OHEIMIL');
  requirePositiveInteger(input.companyId);
  requirePositiveInteger(input.userId);
  requirePositiveInteger(input.bankAccountId);
  requirePositiveInteger(input.bankTransactionId);
  const documentIds = canonicalDocumentIds(input.documentIds);

  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const bank = await tx.bankTransaction.findFirst({
          where: {
            id: input.bankTransactionId, bankAccountId: input.bankAccountId,
            bankAccount: { companyId: input.companyId, isActive: true },
          },
        });
        if (!bank) throw new Error('SAMSTAEDA_BANKI_EKKI_FUNDINN');
        if (bank.amount.isZero()) throw new Error('SAMSTAEDA_OGILD_FJARHAED');
        const existingBankLinks = await tx.financialReconciliation.findMany({
          where: {
            companyId: input.companyId, status: 'CONFIRMED',
            participants: { some: { sourceType: BANK_SOURCE, sourceKey: String(bank.id), role: 'MONEY_MOVEMENT' } },
          },
          select: { id: true, reconciliationType: true, participants: { select: { sourceType: true, sourceKey: true, role: true } } },
        });
        if (existingBankLinks.length > 0) {
          const same = existingBankLinks.length === 1 && existingBankLinks[0].reconciliationType === RECONCILIATION_TYPE &&
            existingBankLinks[0].participants.filter(p => p.sourceType === DOCUMENT_SOURCE && p.role === 'EVIDENCE')
              .map(p => Number(p.sourceKey)).sort((a, b) => a - b).join(',') === documentIds.join(',');
          if (same) return { id: existingBankLinks[0].id, idempotent: true };
          throw new Error('SAMSTAEDA_BANKI_THEGAR_STADFESTUR');
        }
        if (bank.status !== 'UNRECONCILED') throw new Error('SAMSTAEDA_BANKI_THEGAR_AFGREIDDUR');

        const [documents, documentClaims, payment] = await Promise.all([
          tx.aiDetectedDocument.findMany({
            where: { id: { in: documentIds }, receipt: { companyId: input.companyId } },
            select: {
              id: true, receiptId: true, merchantName: true, receiptNumber: true, totalAmount: true,
              reviewedAt: true, reviewedContentRevision: true, contentRevision: true,
              duplicateMarkedAt: true, needsAttentionAt: true, documentType: true, documentRole: true,
              receipt: { select: { description: true, fileHash: true } },
              financialEventLinks: { where: { role: 'PRIMARY' }, select: { id: true } },
            },
          }),
          tx.financialReconciliationParticipant.findMany({
            where: {
              sourceType: DOCUMENT_SOURCE, role: 'EVIDENCE', sourceKey: { in: documentIds.map(String) },
              reconciliation: { companyId: input.companyId, status: 'CONFIRMED' },
            }, select: { sourceKey: true },
          }),
          tx.financialEventPayment.findFirst({ where: { bankTransactionId: bank.id }, select: { id: true } }),
        ]);
        if (payment) throw new Error('SAMSTAEDA_BANKI_THEGAR_GREIDSLA');
        // A family transfer owns the same movement through BankAllocationClaim.
        // Refuse the confirmation if we cannot prove that no such claim exists.
        const table = await tx.$queryRaw<Array<{ present: boolean }>>`
          SELECT to_regclass('public."BankAllocationClaim"') IS NOT NULL AS present`;
        if (table[0]?.present) {
          const claims = await tx.$queryRaw<Array<{ bankTransactionId: number }>>`
            SELECT "bankTransactionId" FROM public."BankAllocationClaim"
            WHERE "bankTransactionId" = ${bank.id}`;
          if (claims.length) throw new Error('SAMSTAEDA_BANKI_THEGAR_UTHLUTADUR');
        }
        if (documents.length !== documentIds.length) throw new Error('SAMSTAEDA_SKJAL_EKKI_FUNDID');
        if (documentClaims.length) throw new Error('SAMSTAEDA_SKJAL_THEGAR_TENGT');

        let total = new Prisma.Decimal(0);
        const snapshot = [];
        for (const doc of documents) {
          if (!doc.reviewedAt || doc.reviewedContentRevision !== doc.contentRevision ||
              doc.duplicateMarkedAt || doc.needsAttentionAt || doc.financialEventLinks.length ||
              doc.documentRole === 'INSIGHT_ONLY' ||
              ['OFFER', 'CONTRACT', 'INFORMATION'].includes((doc.documentType ?? '').toUpperCase())) {
            throw new Error('SAMSTAEDA_SKJAL_THARF_YFIRFERD');
          }
          if (doc.totalAmount === null || !Number.isFinite(doc.totalAmount) || doc.totalAmount <= 0) {
            throw new Error('SAMSTAEDA_OGILD_FJARHAED');
          }
          // Convert via decimal text, not floating point addition.
          const docAmount = new Prisma.Decimal(String(doc.totalAmount));
          total = total.add(docAmount);
          snapshot.push({
            documentId: doc.id, receiptId: doc.receiptId, contentRevision: doc.contentRevision,
            amount: docAmount.toString(), merchantName: doc.merchantName,
            title: doc.merchantName || doc.receipt.description || 'Ónefnt frumskjal',
            receiptFileHash: doc.receipt.fileHash, documentType: doc.documentType,
          });
        }
        if (!total.eq(bank.amount.abs())) throw new Error('SAMSTAEDA_FJARHAEDIR_STEMMA_EKKI');

        const now = new Date();
        const group = await tx.financialReconciliation.create({
          data: {
            companyId: input.companyId,
            reconciliationType: RECONCILIATION_TYPE, status: 'CONFIRMED', source: 'MANUAL',
            confirmedByUserId: input.userId, confirmedAt: now,
            metadata: {
              version: VERSION, confirmationMode: 'HUMAN_DOCUMENT_SET',
              bankTransactionId: bank.id, bankPreviousStatus: bank.status,
              documents: snapshot, bankAmount: bank.amount.toString(), total: total.toString(),
            },
            participants: { create: [
              { sourceType: BANK_SOURCE, sourceKey: String(bank.id), role: 'MONEY_MOVEMENT', matchedAmount: total },
              ...snapshot.map(doc => ({
                sourceType: DOCUMENT_SOURCE, sourceKey: String(doc.documentId), role: 'EVIDENCE',
                matchedAmount: new Prisma.Decimal(doc.amount),
                metadata: { receiptId: doc.receiptId, contentRevision: doc.contentRevision },
              })),
            ] },
          }, select: { id: true },
        });
        const updated = await tx.bankTransaction.updateMany({
          where: { id: bank.id, status: 'UNRECONCILED' }, data: { status: 'RECONCILED' },
        });
        if (updated.count !== 1) throw new Error('SAMSTAEDA_BANKI_BREYTTIST');
        await tx.auditEvent.create({
          data: {
            companyId: input.companyId, userId: input.userId,
            entityType: 'FinancialReconciliation', entityId: group.id,
            action: 'CONFIRM_BANK_TO_DOCUMENT_SET', source: 'USER',
            parentEntityType: BANK_SOURCE, parentEntityId: bank.id,
            beforeData: { bankTransactionStatus: bank.status, reconciliationStatus: null },
            afterData: { bankTransactionStatus: 'RECONCILED', reconciliationStatus: 'CONFIRMED' },
            metadata: { version: VERSION, documentIds, amount: total.toString() },
          },
        });
        return { id: group.id, idempotent: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (attempt >= 2 || !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !['P2034', 'P2002'].includes(error.code)) throw error;
    }
  }
}

export async function voidVisualDocumentSet(input: {
  companyId: number; userId: number; bankAccountId: number; reconciliationId: number; reason: string;
}) {
  if (!documentSetStorageEnabled()) throw new Error('SAMSTAEDA_VISTUN_OHEIMIL');
  requirePositiveInteger(input.companyId);
  requirePositiveInteger(input.userId);
  requirePositiveInteger(input.bankAccountId);
  requirePositiveInteger(input.reconciliationId);
  const reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 500) throw new Error('SAMSTAEDA_ASTAEDA_NAUDSYNLEG');

  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const group = await tx.financialReconciliation.findFirst({
          where: {
            id: input.reconciliationId, companyId: input.companyId,
            reconciliationType: RECONCILIATION_TYPE, status: 'CONFIRMED',
          }, include: { participants: true },
        });
        if (!group) throw new Error('SAMSTAEDA_EKKI_STADFEST');
        const bankSource = group.participants.find(p => p.sourceType === BANK_SOURCE && p.role === 'MONEY_MOVEMENT');
        if (!bankSource) throw new Error('SAMSTAEDA_GOGN_OSAMRAEMI');
        const bankId = Number(bankSource.sourceKey);
        const bank = await tx.bankTransaction.findFirst({
          where: { id: bankId, bankAccountId: input.bankAccountId, bankAccount: { companyId: input.companyId, isActive: true } },
        });
        if (!bank || bank.status !== 'RECONCILED') throw new Error('SAMSTAEDA_BANKASTADA_BREYTT');
        const table = await tx.$queryRaw<Array<{ present: boolean }>>`
          SELECT to_regclass('public."BankAllocationClaim"') IS NOT NULL AS present`;
        if (table[0]?.present) {
          const claims = await tx.$queryRaw<Array<{ bankTransactionId: number }>>`
            SELECT "bankTransactionId" FROM public."BankAllocationClaim"
            WHERE "bankTransactionId" = ${bank.id}`;
          if (claims.length) throw new Error('SAMSTAEDA_BANKI_THEGAR_UTHLUTADUR');
        }
        // A subsequent payment event must not be detached by voiding this set.
        const subsequentPayment = await tx.financialEventPayment.findFirst({
          where: { bankTransactionId: bank.id }, select: { id: true },
        });
        if (subsequentPayment) throw new Error('SAMSTAEDA_BANKI_THEGAR_GREIDSLA');
        const other = await tx.financialReconciliationParticipant.findFirst({
          where: { sourceType: BANK_SOURCE, sourceKey: String(bankId), role: 'MONEY_MOVEMENT',
            reconciliation: { companyId: input.companyId, status: 'CONFIRMED', id: { not: group.id } } },
          select: { id: true },
        });
        if (other) throw new Error('SAMSTAEDA_ANNAR_STADFESTUR_TENGILL');
        const changed = await tx.financialReconciliation.updateMany({
          where: { id: group.id, companyId: input.companyId, status: 'CONFIRMED' },
          data: { status: 'VOID' },
        });
        if (changed.count !== 1) throw new Error('SAMSTAEDA_BREYTTIST');
        const bankChanged = await tx.bankTransaction.updateMany({
          where: { id: bank.id, status: 'RECONCILED' }, data: { status: 'UNRECONCILED' },
        });
        if (bankChanged.count !== 1) throw new Error('SAMSTAEDA_BANKASTADA_BREYTT');
        await tx.auditEvent.create({
          data: {
            companyId: input.companyId, userId: input.userId,
            entityType: 'FinancialReconciliation', entityId: group.id,
            action: 'VOID_BANK_TO_DOCUMENT_SET', source: 'USER',
            parentEntityType: BANK_SOURCE, parentEntityId: bank.id,
            description: reason,
            beforeData: { reconciliationStatus: 'CONFIRMED', bankTransactionStatus: 'RECONCILED' },
            afterData: { reconciliationStatus: 'VOID', bankTransactionStatus: 'UNRECONCILED' },
            metadata: { version: VERSION, reason },
          },
        });
        return { id: group.id };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (attempt >= 2 || !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !['P2034', 'P2002'].includes(error.code)) throw error;
    }
  }
}
