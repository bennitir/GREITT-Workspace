import { confirmBankFinancialEventPayment } from "@/app/banki/actions";
import { bankReconciliationText } from "@/app/banki/_lib/i18n/reconciliation-text";
import type { CandidateReason } from "@/lib/financial-reconciliation/candidates";
import type { BankFinancialEventCandidate } from "@/lib/financial-reconciliation/event-candidates";
import { getBankFinancialEventCandidates } from "@/lib/financial-reconciliation/event-service";
import { getBankBookingReconciliation } from "@/lib/financial-reconciliation/service";
import { getCompanyAccess } from "@/lib/core/access-control";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";
import {
  formatDate,
  formatNumber,
} from "@/lib/locale";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

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

  const [reconciliation, eventCandidateResult] =
    await Promise.all([
      getBankBookingReconciliation(
        bankAccountId,
        activeCompanyId
      ),
      getBankFinancialEventCandidates(
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
    BankFinancialEventCandidate[]
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
    reason: BankFinancialEventCandidate["reason"]
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

              const candidates =
                state === "UNIQUE_STRONG" ||
                state === "AMBIGUOUS_STRONG"
                  ? resolution?.strongCandidates ?? []
                  : state === "POSSIBLE"
                    ? resolution?.possibleCandidates ?? []
                    : [];

              const eventCandidates =
                eventCandidatesByTransactionId.get(
                  transaction.id
                ) ?? [];

              const badge =
                state === "UNIQUE_STRONG"
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
                        {formatDate(transaction.date)}
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

                  {eventCandidates.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                      <p className="text-sm font-semibold text-indigo-900">
                        {t.financialEventCandidates}
                      </p>
                      <p className="mt-1 text-xs text-indigo-800">
                        {t.financialEventCandidateHelp}
                      </p>

                      <div className="mt-3 space-y-2">
                        {eventCandidates.map((candidate) => (
                          <div
                            key={`${candidate.bankTransactionId}-${candidate.eventId}`}
                            className="rounded-lg border border-indigo-200 bg-white p-3 text-sm"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
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
                                  {formatDate(candidate.eventDate)}
                                  {" · "}
                                  {candidate.eventAmount} kr.
                                </p>
                                {candidate.externalReference ? (
                                  <p className="mt-1 text-gray-600">
                                    {t.reference}: {candidate.externalReference}
                                  </p>
                                ) : null}
                                {candidate.evidence.includes(
                                  "EXACT_EVENT_REFERENCE"
                                ) ? (
                                  <p className="mt-1 font-medium text-indigo-800">
                                    {t.referenceAlsoMatches}
                                  </p>
                                ) : null}
                              </div>

                              {access.canReconcileBookkeeping ? (
                                <form
                                  action={confirmBankFinancialEventPayment}
                                >
                                  <input
                                    type="hidden"
                                    name="companyId"
                                    value={activeCompanyId}
                                  />
                                  <input
                                    type="hidden"
                                    name="bankTransactionId"
                                    value={transaction.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="eventId"
                                    value={candidate.eventId}
                                  />
                                  <button
                                    type="submit"
                                    className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
                                  >
                                    {t.confirmEventMatch}
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          </div>
                        ))}
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
