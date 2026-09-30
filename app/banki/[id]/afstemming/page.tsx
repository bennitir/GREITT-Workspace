import { ConfirmFinancialEventMatchForm } from "@/app/banki/[id]/afstemming/ConfirmFinancialEventMatchForm";
import { bankReconciliationText } from "@/app/banki/_lib/i18n/reconciliation-text";
import type { CandidateReason } from "@/lib/financial-reconciliation/candidates";
import {
  getBankFinancialEventCandidates,
  getConfirmedBankFinancialEventLinks,
  type BankFinancialEventCandidateProjection,
  type ConfirmedBankFinancialEventLink,
} from "@/lib/financial-reconciliation/event-service";
import {
  combineBankReconciliationCandidates,
} from "@/lib/financial-reconciliation/cross-layer";
import { getBankBookingReconciliation } from "@/lib/financial-reconciliation/service";
import { getCompanyAccess } from "@/lib/core/access-control";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";
import { formatNumber } from "@/lib/locale";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

function formatReconciliationDate(value: Date) {
  return new Intl.DateTimeFormat("is-IS", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function formatFinancialEventAmount(amount: string, currency: string) {
  const formattedAmount = formatNumber(Number(amount));
  return currency === "ISK"
    ? `${formattedAmount} kr.`
    : `${formattedAmount} ${currency}`;
}

export default async function AfstemmingPage({ params }: Props) {
  const { id } = await params;

  const cookieStore = await cookies();
  const activeCompanyId = Number(
    cookieStore.get("activeCompanyId")?.value
  );

  const bankAccountId = Number(id);

  if (!activeCompanyId || !bankAccountId) {
    notFound();
  }

  const [language, account, access] = await Promise.all([
    getCurrentInterfaceLanguage(),
    prisma.bankAccount.findFirst({
      where: {
        id: bankAccountId,
        companyId: activeCompanyId,
        isActive: true,
      },
      select: {
        id: true,
        bankName: true,
        accountNumber: true,
      },
    }),
    getCompanyAccess(activeCompanyId),
  ]);

  if (!account || !access.allowed) {
    notFound();
  }

  const t = bankReconciliationText(language);

  const [
    reconciliation,
    eventCandidateResult,
    confirmedEventLinkResult,
  ] = await Promise.all([
    getBankBookingReconciliation(
      bankAccountId,
      activeCompanyId
    ),
    getBankFinancialEventCandidates(
      bankAccountId,
      activeCompanyId
    ),
    getConfirmedBankFinancialEventLinks(
      bankAccountId,
      activeCompanyId
    ),
  ]);

  if (!reconciliation.ok) {
    const isNotLinked =
      reconciliation.code === "LEDGER_ACCOUNT_NOT_LINKED";

    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">
          ⚖️ {t.title}
        </h1>

        <div className="mt-6 max-w-5xl rounded-lg border p-6">
          <h2 className="text-xl font-semibold">
            {account.bankName}
          </h2>

          <p className="mt-1 text-gray-600">
            {account.accountNumber ?? t.accountNumberMissing}
          </p>

          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="font-semibold text-amber-900">
              {isNotLinked
                ? t.notLinkedTitle
                : t.sourceErrorTitle}
            </p>

            <p className="mt-2 text-sm text-amber-800">
              {isNotLinked
                ? t.notLinkedHelp
                : t.sourceErrorHelp}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const resolutionByTransactionId = new Map(
    reconciliation.resolutions.map((resolution) => [
      resolution.bankTransactionId,
      resolution,
    ])
  );

  const eventCandidatesByTransactionId = new Map<
    number,
    BankFinancialEventCandidateProjection[]
  >();

  if (eventCandidateResult.ok) {
    for (const candidate of eventCandidateResult.candidates) {
      eventCandidatesByTransactionId.set(candidate.bankTransactionId, [
        ...(eventCandidatesByTransactionId.get(
          candidate.bankTransactionId
        ) ?? []),
        candidate,
      ]);
    }
  }

  const confirmedEventLinksByTransactionId = new Map<
    number,
    ConfirmedBankFinancialEventLink[]
  >();

  if (confirmedEventLinkResult.ok) {
    for (const link of confirmedEventLinkResult.links) {
      confirmedEventLinksByTransactionId.set(link.bankTransactionId, [
        ...(confirmedEventLinksByTransactionId.get(
          link.bankTransactionId
        ) ?? []),
        link,
      ]);
    }
  }

  const transactions = [...reconciliation.transactions].sort(
    (a, b) =>
      b.date.getTime() - a.date.getTime() ||
      b.id - a.id
  );

  function reasonText(reason: CandidateReason) {
    switch (reason) {
      case "EXACT_DATE_AMOUNT_PARTY":
        return t.exactDateAmountParty;
      case "EXACT_DATE_AMOUNT":
        return t.exactDateAmount;
      case "NEAR_DATE_AMOUNT_PARTY":
        return t.nearDateAmountParty;
      case "EXTENDED_DATE_AMOUNT_PARTY":
        return t.extendedDateAmountParty;
      case "NO_DATE_AMOUNT_PARTY":
        return t.noDateAmountParty;
    }
  }

  function eventReasonText(
    reason: BankFinancialEventCandidateProjection["reason"]
  ) {
    return reason === "EXACT_EVENT_AMOUNT_NEAR_DATE"
      ? t.eventNearDate
      : t.eventExtendedDate;
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">
        ⚖️ {t.title}
      </h1>

      <div className="mt-6 max-w-5xl rounded-lg border p-6">
        <h2 className="text-xl font-semibold">
          {account.bankName}
        </h2>

        <p className="mt-1 text-gray-600">
          {account.accountNumber ?? t.accountNumberMissing}
        </p>

        <p className="mt-2 text-sm text-gray-600">
          {t.account}:{" "}
          <strong>
            {reconciliation.ledgerAccount.number}
          </strong>
          {" · "}
          {reconciliation.ledgerAccount.name}
        </p>

        <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          {t.readOnly}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border bg-gray-50 p-4">
            <p className="text-sm text-gray-600">
              {t.transactions}
            </p>
            <p className="mt-1 text-2xl font-bold">
              {reconciliation.transactionCount}
            </p>
          </div>

          <div className="rounded-lg border bg-green-50 p-4">
            <p className="text-sm text-green-700">
              {t.strong}
            </p>
            <p className="mt-1 text-2xl font-bold text-green-700">
              {reconciliation.counts.uniqueStrong}
            </p>
          </div>

          <div className="rounded-lg border bg-amber-50 p-4">
            <p className="text-sm text-amber-700">
              {t.possible}
            </p>
            <p className="mt-1 text-2xl font-bold text-amber-700">
              {reconciliation.counts.possible}
            </p>
          </div>

          <div className="rounded-lg border bg-orange-50 p-4">
            <p className="text-sm text-orange-700">
              {t.ambiguous}
            </p>
            <p className="mt-1 text-2xl font-bold text-orange-700">
              {reconciliation.counts.ambiguousStrong}
            </p>
          </div>

          <div className="rounded-lg border bg-gray-50 p-4">
            <p className="text-sm text-gray-600">
              {t.none}
            </p>
            <p className="mt-1 text-2xl font-bold">
              {reconciliation.counts.none}
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {transactions.length === 0 ? (
            <p className="text-gray-600">
              {t.noTransactions}
            </p>
          ) : (
            transactions.map((transaction) => {
              const resolution =
                resolutionByTransactionId.get(
                  transaction.id
                );

              const state =
                resolution?.state ?? "NONE";

              const bookingCandidates =
                state === "UNIQUE_STRONG" ||
                state === "AMBIGUOUS_STRONG"
                  ? resolution?.strongCandidates ?? []
                  : state === "POSSIBLE"
                    ? resolution?.possibleCandidates ?? []
                    : [];

              const confirmedEventLinks =
                confirmedEventLinksByTransactionId.get(
                  transaction.id
                ) ?? [];

              const eventCandidates =
                confirmedEventLinks.length > 0
                  ? []
                  : eventCandidatesByTransactionId.get(
                      transaction.id
                    ) ?? [];

              const crossLayer = combineBankReconciliationCandidates(
                bookingCandidates,
                eventCandidates,
              );
              const confirmedReceiptIds = new Set(
                confirmedEventLinks.flatMap(
                  (link) => link.primaryReceiptIds,
                ),
              );
              const candidates =
                crossLayer.standaloneBookingCandidates.filter(
                  (candidate) =>
                    !confirmedReceiptIds.has(candidate.receiptId),
                );
              const eventGroups = crossLayer.eventGroups;
              const hasCrossLayerCandidate = eventGroups.some(
                (group) => group.bookingCandidates.length > 0,
              );
              const allEventGroupsCrossLayer =
                eventGroups.length > 0 &&
                eventGroups.every(
                  (group) => group.bookingCandidates.length > 0,
                );

              const badge =
                confirmedEventLinks.length > 0
                  ? {
                      text: t.eventMatchConfirmedBadge,
                      className:
                        "bg-emerald-100 text-emerald-800",
                    }
                  : hasCrossLayerCandidate
                    ? {
                        text: t.obligationPaymentCandidateBadge,
                        className:
                          "bg-indigo-100 text-indigo-800",
                      }
                    : state === "UNIQUE_STRONG"
                      ? {
                          text: t.strongBadge,
                          className:
                            "bg-green-100 text-green-700",
                        }
                      : state === "POSSIBLE"
                        ? {
                            text: t.possibleBadge,
                            className:
                              "bg-amber-100 text-amber-800",
                          }
                        : state === "AMBIGUOUS_STRONG"
                          ? {
                              text: t.ambiguousBadge,
                              className:
                                "bg-orange-100 text-orange-800",
                            }
                          : eventGroups.length > 0
                            ? {
                                text: t.financialEventCandidateBadge,
                                className:
                                  "bg-indigo-100 text-indigo-800",
                              }
                            : {
                                text: t.noneBadge,
                                className:
                                  "bg-gray-100 text-gray-700",
                              };

              return (
                <div
                  key={transaction.id}
                  className="rounded-lg border p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold">
                        {transaction.text}
                      </p>

                      <p className="mt-1 text-sm text-gray-600">
                        {formatReconciliationDate(transaction.date)}
                      </p>
                    </div>

                    <p className="font-semibold">
                      {formatNumber(Number(transaction.amount))} kr.
                    </p>
                  </div>

                  <div className="mt-3">
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${badge.className}`}
                    >
                      {badge.text}
                    </span>
                  </div>

                  {candidates.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {candidates.map((candidate) => (
                        <div
                          key={`${candidate.receiptEntryId}-${candidate.reason}`}
                          className="rounded-lg border bg-gray-50 p-3 text-sm"
                        >
                          <p className="font-medium">
                            {reasonText(candidate.reason)}
                          </p>

                          <p className="mt-1 text-gray-700">
                            {t.booking}:{" "}
                            {candidate.entryText ||
                              candidate.description ||
                              "—"}
                          </p>

                          <p className="mt-1 text-gray-600">
                            {t.account}:{" "}
                            <strong>
                              {candidate.account}
                            </strong>
                            {" · "}
                            {formatNumber(
                              candidate.bookingAmount
                            )}{" "}
                            kr.
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {confirmedEventLinks.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-sm font-semibold text-emerald-900">
                        {t.eventMatchConfirmed}
                      </p>
                      <p className="mt-1 text-xs text-emerald-800">
                        {t.eventMatchConfirmedHelp}
                      </p>

                      <div className="mt-3 space-y-2">
                        {confirmedEventLinks.map((link) => (
                          <div
                            key={`${link.reconciliationId}-${link.paymentId}`}
                            className="rounded-lg border border-emerald-200 bg-white p-3 text-sm"
                          >
                            <p className="font-medium text-emerald-950">
                              {t.financialEvent} #{link.eventId}
                              {" · "}
                              {link.eventType === "CHARGE"
                                ? t.eventCharge
                                : t.eventCredit}
                            </p>
                            <p className="mt-1 text-gray-600">
                              {link.eventDate
                                ? formatReconciliationDate(link.eventDate)
                                : "—"}
                              {" · "}
                              {formatFinancialEventAmount(link.amount, link.currency)}
                            </p>
                            {link.externalReference ? (
                              <p className="mt-1 text-gray-600">
                                {t.reference}: {link.externalReference}
                              </p>
                            ) : null}
                            {link.primaryReceiptIds.length > 0 ? (
                              <p className="mt-1 text-gray-600">
                                {t.sourceReceipt}: {link.primaryReceiptIds
                                  .map((receiptId) => `#${receiptId}`)
                                  .join(", ")}
                              </p>
                            ) : null}
                            {link.confirmedAt ? (
                              <p className="mt-2 font-medium text-emerald-800">
                                {t.confirmedOn}: {formatReconciliationDate(link.confirmedAt)}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : eventGroups.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                      <p className="text-sm font-semibold text-indigo-900">
                        {allEventGroupsCrossLayer
                          ? t.obligationPaymentCandidateTitle
                          : t.financialEventCandidates}
                      </p>
                      <p className="mt-1 text-xs text-indigo-800">
                        {allEventGroupsCrossLayer
                          ? t.obligationPaymentCandidateHelp
                          : t.financialEventCandidateHelp}
                      </p>

                      <div className="mt-3 space-y-2">
                        {eventGroups.map((group) => {
                          const candidate = group.eventCandidate;

                          return (
                            <div
                              key={`${candidate.bankTransactionId}-${candidate.eventId}`}
                              className="rounded-lg border border-indigo-200 bg-white p-3 text-sm"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium">
                                    {t.financialEvent} #{candidate.eventId}
                                    {" · "}
                                    {candidate.eventType === "CHARGE"
                                      ? t.eventCharge
                                      : t.eventCredit}
                                  </p>
                                  <p className="mt-1 text-gray-700">
                                    {eventReasonText(candidate.reason)}
                                  </p>
                                  <p className="mt-1 text-gray-600">
                                    {formatReconciliationDate(
                                      candidate.eventDate,
                                    )}
                                    {" · "}
                                    {formatFinancialEventAmount(
                                      candidate.eventAmount,
                                      "ISK",
                                    )}
                                  </p>
                                  {candidate.externalReference ? (
                                    <p className="mt-1 text-gray-600">
                                      {t.reference}: {candidate.externalReference}
                                    </p>
                                  ) : null}
                                  {group.sharedReceiptIds.length > 0 ? (
                                    <p className="mt-1 font-medium text-indigo-800">
                                      {t.sourceReceipt}: {group.sharedReceiptIds
                                        .map((receiptId) => `#${receiptId}`)
                                        .join(", ")}
                                    </p>
                                  ) : null}
                                  {candidate.evidence.includes(
                                    "EXACT_EVENT_REFERENCE"
                                  ) ? (
                                    <p className="mt-1 font-medium text-indigo-800">
                                      {t.referenceAlsoMatches}
                                    </p>
                                  ) : null}

                                  {group.bookingCandidates.length > 0 ? (
                                    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                                      <p className="font-medium text-gray-800">
                                        {t.bookingEvidence}
                                      </p>
                                      <div className="mt-2 space-y-2">
                                        {group.bookingCandidates.map(
                                          (bookingCandidate) => (
                                            <div
                                              key={bookingCandidate.receiptEntryId}
                                              className="text-gray-700"
                                            >
                                              <p>
                                                {bookingCandidate.entryText ||
                                                  bookingCandidate.description ||
                                                  "—"}
                                              </p>
                                              <p className="mt-1 text-gray-600">
                                                {t.account}: {" "}
                                                <strong>
                                                  {bookingCandidate.account}
                                                </strong>
                                                {" · "}
                                                {formatNumber(
                                                  bookingCandidate.bookingAmount,
                                                )}{" "}
                                                kr.
                                              </p>
                                            </div>
                                          ),
                                        )}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>

                                {access.canReconcileBookkeeping ? (
                                  <ConfirmFinancialEventMatchForm
                                    companyId={activeCompanyId}
                                    bankTransactionId={transaction.id}
                                    eventId={candidate.eventId}
                                    confirmLabel={
                                      group.bookingCandidates.length > 0
                                        ? t.confirmObligationPayment
                                        : t.confirmEventMatch
                                    }
                                    pendingLabel={
                                      group.bookingCandidates.length > 0
                                        ? t.confirmingObligationPayment
                                        : t.confirmingEventMatch
                                    }
                                  />
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
