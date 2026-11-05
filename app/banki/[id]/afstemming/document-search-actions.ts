'use server';

import { requireActiveCompanyReadAccess } from '@/lib/core/company-read-access';
import { prisma } from '@/lib/prisma';
import type { VisualDocumentHit } from '@/app/banki/_lib/visual-reconciliation';

type SearchResult = { ok: true; documents: VisualDocumentHit[] } | { ok: false };

/** Read-only archive lookup. Existing match/confirmation services remain the sole source of reconciliations. */
export async function searchVisualDocuments(bankAccountId: number, rawQuery: string): Promise<SearchResult> {
  if (!Number.isSafeInteger(bankAccountId) || bankAccountId <= 0 || typeof rawQuery !== 'string') return { ok: false };
  const query = rawQuery.trim();
  if (query.length < 2 || query.length > 100) return { ok: false };

  try {
    // Never trust a company identifier supplied by a client. Check the live session and bank account.
    const { companyId } = await requireActiveCompanyReadAccess();
    const account = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, companyId, isActive: true },
      select: { id: true },
    });
    if (!account) return { ok: false };

    const numericId = /^\d{1,9}$/.test(query) ? Number(query) : null;
    const [documents, receipts] = await Promise.all([
      prisma.aiDetectedDocument.findMany({
        where: {
          receipt: { companyId },
          OR: [
            { merchantName: { contains: query, mode: 'insensitive' } },
            { receiptNumber: { contains: query, mode: 'insensitive' } },
            { summary: { contains: query, mode: 'insensitive' } },
            { merchantKennitala: { contains: query } },
            ...(numericId === null ? [] : [
              { id: numericId }, { receiptId: numericId }, { voucherNumber: numericId },
            ]),
          ],
        },
        select: {
          id: true, receiptId: true, merchantName: true, date: true,
          totalAmount: true, receiptNumber: true, voucherNumber: true,
          receipt: { select: { description: true, date: true, aiDate: true, voucherNumber: true } },
        },
        orderBy: { id: 'desc' },
        take: 25,
      }),
      // Legacy/manual receipts do not have child documents. Keep them searchable too.
      prisma.receipt.findMany({
        where: {
          companyId,
          aiDetectedDocuments: { none: {} },
          OR: [
            { description: { contains: query, mode: 'insensitive' } },
            { merchantName: { contains: query, mode: 'insensitive' } },
            { receiptNumber: { contains: query, mode: 'insensitive' } },
            ...(numericId === null ? [] : [{ id: numericId }, { voucherNumber: numericId }]),
          ],
        },
        select: {
          id: true, description: true, merchantName: true, date: true, aiDate: true,
          amount: true, receiptNumber: true, voucherNumber: true,
        },
        orderBy: { id: 'desc' },
        take: 25,
      }),
    ]);

    const found: VisualDocumentHit[] = [
      ...documents.map(doc => ({
        receiptId: doc.receiptId,
        documentId: doc.id,
        title: doc.merchantName || doc.receipt.description,
        reference: doc.receiptNumber,
        amount: doc.totalAmount === null ? null : String(doc.totalAmount),
        date: (doc.date ?? doc.receipt.aiDate ?? doc.receipt.date)?.toISOString() ?? null,
        voucherNumber: doc.voucherNumber ?? doc.receipt.voucherNumber,
      })),
      ...receipts.map(receipt => ({
        receiptId: receipt.id,
        documentId: null,
        title: receipt.merchantName || receipt.description,
        reference: receipt.receiptNumber,
        amount: String(receipt.amount),
        date: (receipt.aiDate ?? receipt.date)?.toISOString() ?? null,
        voucherNumber: receipt.voucherNumber,
      })),
    ];
    // Limit the rendered list without silently claiming these are all matches.
    found.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.receiptId - a.receiptId);
    return { ok: true, documents: found.slice(0, 25) };
  } catch {
    // Do not disclose tenant details, database errors, SQL or authentication internals.
    return { ok: false };
  }
}
