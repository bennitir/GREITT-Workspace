import { ConfirmCardReviewedDocumentMatchForm } from "@/app/banki/kort/[id]/ConfirmCardReviewedDocumentMatchForm";
import { paymentCardPageContext } from "@/app/banki/kort/_lib/page-context";
import { getCompanyAccess } from "@/lib/core/access-control";
import { normalizePartyText } from "@/lib/financial-reconciliation/candidates";
import { evidenceKindForReviewedDocumentType } from "@/lib/financial-reconciliation/reviewed-document-provider";
import { materializeCanonicalReviewedDocuments } from "@/lib/financial-reconciliation/reviewed-document-read-model";
import {
  classificationExcludesDocumentCoverage,
  isFinancialSourceClassificationCode,
} from "@/lib/financial-reconciliation/source-classification";
import { formatDate, formatNumber } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DAY_MS = 86_400_000;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function dayOrdinal(value: Date) {
  return Math.floor(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  ) / DAY_MS);
}

function daysBetween(left: Date, right: Date) {
  return Math.abs(dayOrdinal(left) - dayOrdinal(right));
}

function normalizeSearch(value: unknown) {
  return String(value ?? "").toLocaleLowerCase("is-IS").trim();
}

export default async function ManualCardReconciliationPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const paymentCardId = Number(id);
  const transactionId = Number(first(query.transaction));
  const { companyId, t } = await paymentCardPageContext();

  if (
    !companyId ||
    !Number.isSafeInteger(paymentCardId) || paymentCardId < 1 ||
    !Number.isSafeInteger(transactionId) || transactionId < 1
  ) notFound();

  const [access, transaction] = await Promise.all([
    getCompanyAccess(companyId),
    prisma.paymentCardTransaction.findFirst({
      where: {
        id: transactionId,
        paymentCardId,
        paymentCard: { companyId, isActive: true },
      },
      include: {
        paymentCard: {
          select: { id: true, name: true, issuerName: true, network: true, lastFour: true },
        },
      },
    }),
  ]);
  if (!access.allowed || !transaction) notFound();

  const q = first(query.q).trim();
  const amountFilter = first(query.amount) === "all" ? "all" : "same";
  const daysValue = first(query.days);
  const dayWindow = daysValue === "all" ? null : daysValue === "90" ? 90 : 30;

  const [rawDocuments, confirmedDocumentParticipants, classification] = await Promise.all([
    prisma.aiDetectedDocument.findMany({
      where: {
        reviewedAt: { not: null },
        totalAmount: { not: null },
        duplicateMarkedAt: null,
        disposedAt: null,
        disposition: null,
        receipt: { companyId },
      },
      select: {
        id: true,
        receiptId: true,
        reviewedAt: true,
        date: true,
        documentType: true,
        documentRole: true,
        totalAmount: true,
        receiptNumber: true,
        merchantName: true,
        merchantKennitala: true,
        pageNumber: true,
        documentFingerprint: true,
        classificationSource: true,
        duplicateMarkedAt: true,
        disposedAt: true,
        disposition: true,
        receipt: {
          select: {
            date: true,
            aiDate: true,
            merchantName: true,
            merchantKennitala: true,
            _count: { select: { aiDetectedDocuments: true } },
          },
        },
        entityLinks: {
          select: {
            role: true,
            entity: {
              select: {
                id: true,
                entityType: true,
                name: true,
                identifierType: true,
                identifierValue: true,
              },
            },
          },
        },
        financialEventLinks: {
          select: { role: true, eventId: true },
        },
      },
      orderBy: [{ id: "asc" }],
      take: 1500,
    }),
    prisma.financialReconciliationParticipant.findMany({
      where: {
        sourceType: "AI_DETECTED_DOCUMENT",
        role: "EVIDENCE",
        reconciliation: { companyId, status: "CONFIRMED" },
      },
      select: { sourceKey: true },
    }),
    prisma.financialSourceClassification.findUnique({
      where: {
        companyId_sourceType_sourceKey: {
          companyId,
          sourceType: "PAYMENT_CARD_TRANSACTION",
          sourceKey: String(transactionId),
        },
      },
      select: { classification: true },
    }),
  ]);

  const classificationCode = classification && isFinancialSourceClassificationCode(classification.classification)
    ? classification.classification
    : null;

  const unavailableDocumentIds = new Set(
    confirmedDocumentParticipants
      .map((participant) => Number(participant.sourceKey))
      .filter((documentId) => Number.isSafeInteger(documentId) && documentId > 0),
  );
  const rawByDocumentId = new Map(rawDocuments.map((document) => [document.id, document] as const));
  const canonicalDocuments = materializeCanonicalReviewedDocuments(
    rawDocuments.map((document) => ({
      ...document,
      container: {
        detectedDocumentCount: document.receipt._count.aiDetectedDocuments,
        date: document.receipt.date,
        aiDate: document.receipt.aiDate,
        merchantName: document.receipt.merchantName,
        merchantKennitala: document.receipt.merchantKennitala,
      },
    })),
  );

  const transactionAmount = Number(transaction.amount);
  const searchNeedle = normalizeSearch(q);
  const normalizedTransactionMerchant = normalizePartyText(transaction.merchantText);

  const documents = canonicalDocuments
    .map((document) => {
      const raw = rawByDocumentId.get(document.documentId)!;
      const amount = Number(document.totalAmount);
      const amountDifference = Math.abs(Math.abs(transactionAmount) - Math.abs(amount));
      const exactAmount = amountDifference < 0.005;
      const dateDistanceDays = document.effectiveDate
        ? daysBetween(transaction.date, document.effectiveDate)
        : Number.POSITIVE_INFINITY;
      const aliases = [...new Set([document.merchantName, ...(document.partyAliases ?? [])].filter(Boolean))] as string[];
      const partyCompatible = normalizedTransactionMerchant.length >= 3 && aliases
        .map(normalizePartyText)
        .filter((value) => value.length >= 3)
        .some((value) =>
          value === normalizedTransactionMerchant ||
          value.includes(normalizedTransactionMerchant) ||
          normalizedTransactionMerchant.includes(value),
        );
      const canonicalIdentifiers = [
        document.merchantKennitala,
        document.receiptNumber,
        ...document.invoiceIdentifiers,
      ].filter((value): value is string => Boolean(value && value.trim()));
      const haystack = normalizeSearch([
        document.merchantName,
        ...aliases,
        ...canonicalIdentifiers,
        document.documentType,
        document.documentRole,
        document.receiptId,
        document.documentId,
      ].filter(Boolean).join(" "));
      const alreadyReconciled = unavailableDocumentIds.has(document.documentId);
      const hasCanonicalLocalFacts = Boolean(
        raw.date && Number.isFinite(raw.date.getTime()) && raw.merchantName?.trim(),
      );
      const hasPrimaryEvent = document.hasPrimaryFinancialEvent;
      const automaticEvidenceKind = evidenceKindForReviewedDocumentType(document.documentType);
      const confirmable =
        access.canReconcileBookkeeping &&
        transaction.status !== "RECONCILED" &&
        exactAmount &&
        hasCanonicalLocalFacts &&
        !hasPrimaryEvent &&
        !alreadyReconciled &&
        !classificationExcludesDocumentCoverage(classificationCode);

      return {
        ...document,
        amount,
        amountDifference,
        exactAmount,
        dateDistanceDays,
        aliases,
        canonicalIdentifiers: [...new Set(canonicalIdentifiers)],
        partyCompatible,
        alreadyReconciled,
        hasCanonicalLocalFacts,
        automaticEvidenceKind,
        confirmable,
        matchesText: !searchNeedle || haystack.includes(searchNeedle),
      };
    })
    .filter((document) => document.matchesText)
    .filter((document) => amountFilter === "all" || document.exactAmount)
    .filter((document) => dayWindow === null || document.dateDistanceDays <= dayWindow)
    .sort((left, right) =>
      Number(right.exactAmount) - Number(left.exactAmount) ||
      Number(right.dateDistanceDays === 0) - Number(left.dateDistanceDays === 0) ||
      Number(right.partyCompatible) - Number(left.partyCompatible) ||
      left.amountDifference - right.amountDifference ||
      left.dateDistanceDays - right.dateDistanceDays ||
      right.documentId - left.documentId,
    )
    .slice(0, 200);

  const classificationBlocksDocuments = classificationExcludesDocumentCoverage(classificationCode);
  const successHref = `/banki/kort/${paymentCardId}?filter=active#transaction-${transactionId}`;

  return (
    <main className="p-8">
      <div className="max-w-6xl">
        <Link
          href={`/banki/kort/${paymentCardId}?filter=active#transaction-${transactionId}`}
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← {t.manualBack}
        </Link>

        <h1 className="mt-4 text-2xl font-bold">⚖️ {t.manualTitle}</h1>
        <p className="mt-2 max-w-4xl text-sm text-gray-600">{t.manualHelp}</p>

        <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50/50 p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-800">
            {t.manualCardTransaction}
          </div>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-semibold">{transaction.merchantText}</div>
              <div className="mt-1 text-sm text-gray-600">
                {formatDate(transaction.date)}
                {transaction.merchantCategory ? ` · ${transaction.merchantCategory}` : ""}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {transaction.paymentCard.name}
                {transaction.paymentCard.lastFour ? ` · •••• ${transaction.paymentCard.lastFour}` : ""}
              </div>
            </div>
            <div className="text-xl font-bold">{formatNumber(transactionAmount)} kr.</div>
          </div>
        </section>

        {classificationBlocksDocuments ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="font-semibold">{t.manualClassificationBlockedTitle}</div>
            <div className="mt-1 text-xs">{t.manualClassificationBlockedHelp}</div>
          </div>
        ) : null}

        <form className="mt-5 grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <input type="hidden" name="transaction" value={transactionId} />
          <input
            name="q"
            defaultValue={q}
            placeholder={t.manualSearchPlaceholder}
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <select
            name="amount"
            defaultValue={amountFilter}
            aria-label={t.manualAmountFilter}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="same">{t.manualAmountSame}</option>
            <option value="all">{t.manualAmountAll}</option>
          </select>
          <select
            name="days"
            defaultValue={dayWindow === null ? "all" : String(dayWindow)}
            aria-label={t.manualDaysFilter}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="30">{t.manualDays30}</option>
            <option value="90">{t.manualDays90}</option>
            <option value="all">{t.manualDaysAll}</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {t.manualSearch}
          </button>
        </form>

        <section className="mt-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">{t.manualResults}</h2>
            <span className="text-sm text-gray-500">{documents.length}</span>
          </div>

          {documents.length === 0 ? (
            <div className="mt-3 rounded-lg border bg-gray-50 p-4 text-sm text-gray-600">
              {t.manualNoResults}
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {documents.map((document) => (
                <article key={document.documentId} className="rounded-xl border bg-white p-4">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold">
                          {t.receipt} #{document.receiptId}
                          {document.documentPageNumber != null
                            ? ` · ${t.sourcePage} ${document.documentPageNumber}`
                            : ` · ${t.detectedDocument} ${document.documentId}`}
                        </div>
                        {document.exactAmount ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                            {t.manualExactAmount}
                          </span>
                        ) : null}
                        {document.dateDistanceDays === 0 ? (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                            {t.manualExactDate}
                          </span>
                        ) : null}
                        {document.partyCompatible ? (
                          <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-xs font-semibold text-cyan-800">
                            {t.manualPartyCompatible}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-2 text-sm">
                        <span className="font-medium">{document.merchantName ?? "—"}</span>
                        <span className="text-gray-600">
                          {` · ${document.effectiveDate ? formatDate(document.effectiveDate) : "—"}`}
                          {` · ${formatNumber(document.amount)} kr.`}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {t.dateDistance}: {Number.isFinite(document.dateDistanceDays) ? document.dateDistanceDays : "—"} {t.days}
                        {document.documentType ? ` · ${document.documentType}` : ""}
                        {document.receiptNumber ? ` · ${t.manualReceiptNumber}: ${document.receiptNumber}` : ""}
                      </div>

                      {document.canonicalIdentifiers.length > 0 ? (
                        <div className="mt-1 text-xs text-gray-500">
                          {t.manualCanonicalIdentifiers}: {document.canonicalIdentifiers.join(" · ")}
                        </div>
                      ) : null}

                      {!document.automaticEvidenceKind ? (
                        <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-2 text-xs text-violet-900">
                          {t.manualAutomaticSearchDidNotUseDocument}
                        </div>
                      ) : null}
                      {document.hasPrimaryFinancialEvent ? (
                        <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-900">
                          {t.manualPrimaryEventBlocked}
                        </div>
                      ) : null}
                      {document.alreadyReconciled ? (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                          {t.manualAlreadyReconciled}
                        </div>
                      ) : null}
                      {!document.hasCanonicalLocalFacts ? (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                          {t.manualCanonicalFactsRequired}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-start gap-2 md:justify-end">
                      <Link
                        href={`/fylgiskjol/${document.receiptId}?document=${document.documentId}`}
                        className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                      >
                        {t.openDocument}
                      </Link>
                      {document.confirmable ? (
                        <ConfirmCardReviewedDocumentMatchForm
                          paymentCardTransactionId={transaction.id}
                          documentId={document.documentId}
                          confirmLabel={t.manualConfirm}
                          pendingLabel={t.manualConfirming}
                          successHref={successHref}
                        />
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
