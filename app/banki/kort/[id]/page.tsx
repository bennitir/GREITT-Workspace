import Link from "next/link";
import { notFound } from "next/navigation";
import {
  confirmCardReviewedDocumentMatch,
  setPaymentCardTransactionClassificationsAction,
} from "@/app/banki/kort/actions";
import { CardTransactionClassificationControls } from "@/app/banki/kort/[id]/CardTransactionClassificationControls";
import { CardBulkClassificationManager } from "@/app/banki/kort/[id]/CardBulkClassificationManager";
import { CardReviewedDocumentDiagnosticOverview } from "@/app/banki/kort/[id]/CardReviewedDocumentDiagnosticOverview";
import { ReconciliationCoverageOverview } from "@/app/banki/_components/ReconciliationCoverageOverview";
import { paymentCardPageContext } from "@/app/banki/kort/_lib/page-context";
import { getCompanyAccess } from "@/lib/core/access-control";
import { getCardReviewedDocumentCandidates } from "@/lib/financial-reconciliation/card-reviewed-document-service";
import { getPaymentCardTransactionClassifications } from "@/lib/financial-reconciliation/source-classification-service";
import {
  classificationExcludesDocumentCoverage,
  type FinancialSourceClassificationCode,
} from "@/lib/financial-reconciliation/source-classification";
import { formatDate, formatNumber } from "@/lib/locale";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ filter?: string | string[] }>;
};

type CardTransactionFilter = "active" | "all" | "personal" | "excluded" | "review";

function cardTransactionFilter(value: string | string[] | undefined): CardTransactionFilter {
  const actual = Array.isArray(value) ? value[0] : value;
  return actual === "all" ||
    actual === "personal" ||
    actual === "excluded" ||
    actual === "review"
    ? actual
    : "active";
}

function classificationLabel(
  classification: FinancialSourceClassificationCode,
  labels: {
    business: string;
    personal: string;
    internalTransfer: string;
    nonDocument: string;
    review: string;
  },
) {
  switch (classification) {
    case "BUSINESS": return labels.business;
    case "PERSONAL": return labels.personal;
    case "INTERNAL_TRANSFER": return labels.internalTransfer;
    case "NON_DOCUMENT": return labels.nonDocument;
    case "REVIEW": return labels.review;
  }
}


export default async function PaymentCardPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query: { filter?: string | string[] } = searchParams ? await searchParams : {};
  const paymentCardId = Number(id);
  const filter = cardTransactionFilter(query.filter);
  const { companyId, t, coverageT, classificationT, diagnosticT } = await paymentCardPageContext();

  if (!companyId || !paymentCardId) notFound();

  const [card, access] = await Promise.all([
    prisma.paymentCard.findFirst({
      where: { id: paymentCardId, companyId, isActive: true },
    }),
    getCompanyAccess(companyId),
  ]);
  if (!card || !access.allowed) notFound();

  const [transactions, candidateResult, classifications] = await Promise.all([
    prisma.paymentCardTransaction.findMany({
      where: { paymentCardId: card.id },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: 200,
    }),
    getCardReviewedDocumentCandidates(card.id, companyId),
    getPaymentCardTransactionClassifications({
      companyId,
      paymentCardId: card.id,
      prisma,
    }),
  ]);

  const resolutionByTransactionId = new Map(
    candidateResult.ok
      ? candidateResult.resolutions.map((resolution) => [
          resolution.paymentCardTransactionId,
          resolution,
        ] as const)
      : [],
  );
  const diagnosticByTransactionId = new Map(
    candidateResult.ok
      ? candidateResult.diagnostics.diagnostics.map((diagnostic) => [diagnostic.sourceId, diagnostic] as const)
      : [],
  );

  const classificationByTransactionId = new Map(
    classifications.map((classification) => [
      classification.paymentCardTransactionId,
      classification.classification,
    ] as const),
  );
  const visibleTransactions = transactions.filter((transaction) => {
    const classification = classificationByTransactionId.get(transaction.id) ?? null;
    switch (filter) {
      case "all": return true;
      case "personal": return classification === "PERSONAL";
      case "excluded": return classificationExcludesDocumentCoverage(classification);
      case "review": return classification === null || classification === "REVIEW";
      case "active": return !classificationExcludesDocumentCoverage(classification);
    }
  });
  const allowPersonal = candidateResult.ok &&
    candidateResult.coveragePolicy.allowsPersonalTransactionExclusion;
  const filterLinks: Array<{ key: CardTransactionFilter; label: string }> = [
    { key: "active", label: classificationT.filterActive },
    { key: "all", label: classificationT.filterAll },
    { key: "personal", label: classificationT.filterPersonal },
    { key: "excluded", label: classificationT.filterExcluded },
    { key: "review", label: classificationT.filterReview },
  ];


  return (
    <main className="p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">💳 {card.name}</h1>
          <p className="mt-1 text-gray-600">
            {[card.issuerName, card.network].filter(Boolean).join(" · ") || t.card}
            {card.lastFour ? ` · •••• ${card.lastFour}` : ""}
          </p>
        </div>
        <Link href="/banki" className="rounded-lg border px-4 py-2 font-medium">
          ← {t.sectionTitle}
        </Link>
      </div>

      <div className="mt-6 max-w-7xl rounded-lg border p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <p><strong>{t.issuer}:</strong> {card.issuerName ?? t.notRegistered}</p>
          <p><strong>{t.network}:</strong> {card.network ?? t.notRegistered}</p>
          <p><strong>{t.lastFour}:</strong> {card.lastFour ?? t.notRegistered}</p>
        </div>

        <Link
          href={`/banki/kort/${card.id}/innflutningur`}
          className="mt-6 inline-block rounded-lg border border-blue-600 px-4 py-2 font-medium text-blue-700"
        >
          📥 {t.importStatement}
        </Link>

        <div className="mt-8 rounded-lg border border-cyan-200 bg-cyan-50/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-cyan-950">{t.reconciliation}</h2>
              <p className="mt-1 max-w-4xl text-sm text-cyan-900/80">{t.reconciliationHelp}</p>
            </div>
            {candidateResult.ok ? (
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-green-100 px-2.5 py-1 text-green-800">
                  {t.strongMatch}: {candidateResult.counts.uniqueStrong}
                </span>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
                  {t.possibleMatch}: {candidateResult.counts.uniquePossible}
                </span>
                <span className="rounded-full bg-orange-100 px-2.5 py-1 text-orange-800">
                  {t.ambiguousMatch}: {candidateResult.counts.ambiguous}
                </span>
              </div>
            ) : (
              <span className="text-sm font-medium text-red-700">{t.reconciliationUnavailable}</span>
            )}
          </div>
        </div>

        {candidateResult.ok ? (
          <ReconciliationCoverageOverview
            snapshot={candidateResult.coverage}
            labels={coverageT}
            targetBasisHelp={coverageT.targetBasisCard}
          />
        ) : null}

        {candidateResult.ok ? (
          <CardReviewedDocumentDiagnosticOverview
            summary={candidateResult.diagnostics}
            labels={diagnosticT}
          />
        ) : null}

        <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{t.transactions}</h2>
            <p className="mt-1 text-xs text-gray-500">{classificationT.help}</p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label={classificationT.filterTitle}>
            {filterLinks.map((item) => (
              <Link
                key={item.key}
                href={`/banki/kort/${card.id}?filter=${item.key}`}
                className={
                  filter === item.key
                    ? "rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                    : "rounded-full border bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                }
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {access.canReconcileBookkeeping && visibleTransactions.length > 0 ? (
          <CardBulkClassificationManager
            paymentCardId={card.id}
            filterKey={filter}
            allowPersonal={allowPersonal}
            labels={classificationT}
            action={setPaymentCardTransactionClassificationsAction}
          />
        ) : null}

        {visibleTransactions.length === 0 ? (
          <p className="mt-4 text-gray-600">{t.noTransactions}</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                  {access.canReconcileBookkeeping ? (
                    <th className="w-12 p-2 text-center">{classificationT.select}</th>
                  ) : null}
                  <th className="p-2">{t.date}</th>
                  <th className="p-2">{t.merchant}</th>
                  <th className="p-2">{t.category}</th>
                  <th className="p-2">{t.cardPeriod}</th>
                  <th className="p-2 text-right">ISK</th>
                  <th className="min-w-72 p-2">{t.reconciliation}</th>
                </tr>
              </thead>
              <tbody>
                {visibleTransactions.map((transaction) => {
                  const resolution = resolutionByTransactionId.get(transaction.id);
                  const onlyCandidate = resolution?.candidates.length === 1
                    ? resolution.candidates[0]
                    : null;
                  const classification = classificationByTransactionId.get(transaction.id) ?? null;
                  const diagnostic = diagnosticByTransactionId.get(transaction.id) ?? null;
                  const excludedFromDocumentCoverage = classificationExcludesDocumentCoverage(classification);

                  return (
                    <tr id={`transaction-${transaction.id}`} key={transaction.id} className="border-b align-top">
                      {access.canReconcileBookkeeping ? (
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            name="paymentCardTransactionId"
                            value={transaction.id}
                            data-card-bulk-selection={card.id}
                            disabled={transaction.status === "RECONCILED"}
                            aria-label={`${classificationT.select}: ${transaction.merchantText}`}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </td>
                      ) : null}
                      <td className="whitespace-nowrap p-2">{formatDate(transaction.date)}</td>
                      <td className="p-2 font-medium">{transaction.merchantText}</td>
                      <td className="p-2">{transaction.merchantCategory ?? "—"}</td>
                      <td className="p-2">{transaction.cardPeriod ?? "—"}</td>
                      <td className="whitespace-nowrap p-2 text-right font-semibold">
                        {formatNumber(transaction.amount.toNumber())} kr.
                      </td>
                      <td className="p-2">
                        {excludedFromDocumentCoverage && classification ? (
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">
                            {classificationLabel(classification, classificationT)}
                          </span>
                        ) : transaction.status === "RECONCILED" ? (
                          <span className="inline-flex rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
                            {t.reconciled}
                          </span>
                        ) : resolution?.state === "AMBIGUOUS" ? (
                          <div>
                            <span className="inline-flex rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800">
                              {t.ambiguousMatch} · {resolution.candidates.length}
                            </span>
                            <div className="mt-2 grid gap-2">
                              {resolution.candidates.slice(0, 3).map((candidate) => (
                                <Link
                                  key={candidate.documentId}
                                  href={`/fylgiskjol/${candidate.receiptId}?document=${candidate.documentId}`}
                                  className="rounded-md border border-orange-200 bg-white px-2.5 py-2 text-xs text-blue-800 hover:bg-orange-50"
                                >
                                  <span className="font-semibold">
                                    {t.receipt} #{candidate.receiptId}
                                    {candidate.documentPageNumber != null
                                      ? ` · ${t.sourcePage} ${candidate.documentPageNumber}`
                                      : ` · ${t.detectedDocument} ${candidate.documentId}`}
                                  </span>
                                  <span className="mt-0.5 block text-gray-600">
                                    {candidate.merchantName ? `${candidate.merchantName} · ` : ""}
                                    {formatDate(candidate.documentDate)} · {formatNumber(Number(candidate.documentAmount))} kr.
                                  </span>
                                </Link>
                              ))}
                            </div>
                          </div>
                        ) : onlyCandidate ? (
                          <div className="rounded-lg border border-gray-200 bg-white p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                resolution?.state === "UNIQUE_STRONG"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}>
                                {resolution?.state === "UNIQUE_STRONG" ? t.strongMatch : t.possibleMatch}
                              </span>
                              <span className="text-xs text-gray-500">
                                {t.dateDistance}: {onlyCandidate.dateDistanceDays} {t.days}
                              </span>
                            </div>
                            <div className="mt-1 font-medium">
                              {t.receipt} #{onlyCandidate.receiptId}
                              {onlyCandidate.documentPageNumber != null
                                ? ` · ${t.sourcePage} ${onlyCandidate.documentPageNumber}`
                                : ` · ${t.detectedDocument} ${onlyCandidate.documentId}`}
                              {onlyCandidate.merchantName ? ` · ${onlyCandidate.merchantName}` : ""}
                            </div>
                            <div className="mt-1 text-xs text-gray-600">
                              {formatDate(onlyCandidate.documentDate)} · {formatNumber(Number(onlyCandidate.documentAmount))} kr.
                            </div>
                            {onlyCandidate.identityEvidence === "EXACT_AMOUNT_DATE" ? (
                              <div className="mt-1 text-xs font-medium text-amber-800">
                                {t.exactAmountDateNeedsIdentity}
                              </div>
                            ) : null}
                            <div className="mt-2 flex flex-wrap gap-2">
                              <Link
                                href={`/fylgiskjol/${onlyCandidate.receiptId}?document=${onlyCandidate.documentId}`}
                                className="rounded-md border px-2.5 py-1.5 text-xs font-semibold text-blue-700"
                              >
                                {t.openDocument}
                              </Link>
                              {access.canReconcileBookkeeping ? (
                                <form action={confirmCardReviewedDocumentMatch}>
                                  <input
                                    type="hidden"
                                    name="paymentCardTransactionId"
                                    value={transaction.id}
                                  />
                                  <input type="hidden" name="documentId" value={onlyCandidate.documentId} />
                                  <button
                                    type="submit"
                                    className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-800"
                                  >
                                    {t.confirmMatch}
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <span className="text-xs text-gray-500">{t.noMatch}</span>
                            {diagnostic &&
                            diagnostic.reason !== "CANDIDATE_FOUND" &&
                            diagnostic.reason !== "AMBIGUOUS" ? (
                              <div className="mt-1 text-xs font-medium text-violet-700">
                                {diagnosticT.reason[diagnostic.reason]}
                              </div>
                            ) : null}
                          </div>
                        )}
                        {access.canReconcileBookkeeping &&
                        transaction.status !== "RECONCILED" &&
                        !excludedFromDocumentCoverage &&
                        !onlyCandidate ? (
                          <div className="mt-2">
                            <Link
                              href={`/banki/kort/${card.id}/afstemming/handvirkt?transaction=${transaction.id}&amount=same&days=30`}
                              className="inline-flex rounded-md border border-blue-300 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                            >
                              {t.manualReconcile}
                            </Link>
                          </div>
                        ) : null}
                        {access.canReconcileBookkeeping ? (
                          <CardTransactionClassificationControls
                            paymentCardId={card.id}
                            paymentCardTransactionId={transaction.id}
                            classification={classification}
                            allowPersonal={allowPersonal}
                            labels={classificationT}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
