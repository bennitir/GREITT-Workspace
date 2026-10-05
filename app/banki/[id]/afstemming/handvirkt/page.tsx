import { ConfirmManualFinancialEventMatchForm } from "@/app/banki/[id]/afstemming/ConfirmManualFinancialEventMatchForm";
import { ConfirmReviewedDocumentMatchForm } from "@/app/banki/[id]/afstemming/ConfirmReviewedDocumentMatchForm";
import { bankReconciliationText } from "@/app/banki/_lib/i18n/reconciliation-text";
import { getCompanyAccess } from "@/lib/core/access-control";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";
import { formatNumber } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
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

function formatDate(value: Date | null) {
  return value
    ? new Intl.DateTimeFormat("is-IS", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(value)
    : "—";
}

function normalizeSearch(value: unknown) {
  return String(value ?? "").toLocaleLowerCase("is-IS").trim();
}

export default async function ManualReconciliationPage({
  params,
  searchParams,
}: Props) {
  const { id } = await params;
  const query = await searchParams;
  const bankAccountId = Number(id);
  const transactionId = Number(first(query.transaction));
  const showConfirmedBanner = first(query.confirmed) === "1";

  const cookieStore = await cookies();
  const companyId = Number(cookieStore.get("activeCompanyId")?.value);
  if (
    !Number.isSafeInteger(companyId) || companyId < 1 ||
    !Number.isSafeInteger(bankAccountId) || bankAccountId < 1 ||
    !Number.isSafeInteger(transactionId) || transactionId < 1
  ) notFound();

  const [language, access, bank] = await Promise.all([
    getCurrentInterfaceLanguage(),
    getCompanyAccess(companyId),
    prisma.bankTransaction.findFirst({
      where: {
        id: transactionId,
        bankAccountId,
        bankAccount: { companyId, isActive: true },
      },
      include: {
        bankAccount: {
          select: { id: true, bankName: true, accountNumber: true },
        },
      },
    }),
  ]);

  if (!access.allowed || !bank) notFound();
  const t = bankReconciliationText(language);

  const q = first(query.q).trim();
  const amountFilter = first(query.amount) === "all" ? "all" : "same";
  const daysValue = first(query.days);
  const dayWindow = daysValue === "all"
    ? null
    : daysValue === "90"
      ? 90
      : 30;

  const nextTransaction = await prisma.bankTransaction.findFirst({
    where: {
      bankAccountId,
      status: { not: "RECONCILED" },
      OR: [
        { date: { lt: bank.date } },
        { date: bank.date, id: { lt: bank.id } },
      ],
    },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    select: { id: true },
  });

  const preservedDays = dayWindow === null ? "all" : String(dayWindow);
  const successHref = nextTransaction
    ? `/banki/${bankAccountId}/afstemming/handvirkt?transaction=${nextTransaction.id}&amount=${amountFilter}&days=${preservedDays}&confirmed=1`
    : `/banki/${bankAccountId}/afstemming#transaction-${bank.id}`;

  const rawDocuments = await prisma.aiDetectedDocument.findMany({
    where: {
      reviewedAt: { not: null },
      totalAmount: { not: null },
      receipt: { companyId },
    },
    select: {
      id: true,
      receiptId: true,
      date: true,
      reviewedAt: true,
      documentType: true,
      documentRole: true,
      totalAmount: true,
      receiptNumber: true,
      merchantName: true,
      merchantKennitala: true,
      summary: true,
      receipt: {
        select: {
          date: true,
          aiDate: true,
          merchantName: true,
          merchantKennitala: true,
        },
      },
      entityLinks: {
        select: {
          entity: {
            select: {
              entityType: true,
              identifierType: true,
              identifierValue: true,
            },
          },
        },
      },
      financialEventLinks: {
        where: { role: "PRIMARY" },
        select: {
          eventId: true,
          source: true,
          event: {
            select: {
              id: true,
              eventType: true,
              status: true,
              title: true,
              eventDate: true,
              amount: true,
              currency: true,
              externalReference: true,
              liabilityAccount: {
                select: { number: true, name: true },
              },
              payments: {
                where: { status: "CONFIRMED" },
                select: {
                  id: true,
                  amount: true,
                  bankTransactionId: true,
                  bankTransaction: {
                    select: {
                      id: true,
                      bankAccountId: true,
                      date: true,
                      text: true,
                      reference: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ reviewedAt: "desc" }, { id: "desc" }],
    take: 1000,
  });

  const bankAmount = Number(bank.amount);
  const searchNeedle = normalizeSearch(q);

  const documents = rawDocuments
    .map((document) => {
      const effectiveDate = document.date ?? document.receipt.aiDate ?? document.receipt.date;
      const amount = Number(document.totalAmount);
      const amountDifference = Math.abs(Math.abs(bankAmount) - Math.abs(amount));
      const exactAmount = amountDifference < 0.005;
      const dateDistanceDays = effectiveDate
        ? daysBetween(bank.date, effectiveDate)
        : Number.POSITIVE_INFINITY;
      const merchantName = document.merchantName ?? document.receipt.merchantName;
      const merchantKennitala = document.merchantKennitala ?? document.receipt.merchantKennitala;
      const canonicalIdentifiers = document.entityLinks
        .map((link) => link.entity.identifierValue)
        .filter((value): value is string => Boolean(value && value.trim()));
      const eventReferences = document.financialEventLinks
        .map((link) => link.event.externalReference)
        .filter((value): value is string => Boolean(value && value.trim()));
      const haystack = normalizeSearch([
        merchantName,
        merchantKennitala,
        document.receiptNumber,
        ...canonicalIdentifiers,
        ...eventReferences,
        document.summary,
        document.documentType,
        document.receiptId,
      ].filter(Boolean).join(" "));
      return {
        ...document,
        effectiveDate,
        amount,
        amountDifference,
        exactAmount,
        dateDistanceDays,
        merchantName,
        merchantKennitala,
        canonicalIdentifiers: [...new Set(canonicalIdentifiers)],
        matchesText: !searchNeedle || haystack.includes(searchNeedle),
        hasPrimaryEvent: document.financialEventLinks.length > 0,
      };
    })
    .filter((document) => document.matchesText)
    .filter((document) => amountFilter === "all" || document.exactAmount)
    .filter((document) => dayWindow === null || document.dateDistanceDays <= dayWindow)
    .sort((left, right) =>
      Number(right.exactAmount) - Number(left.exactAmount) ||
      left.amountDifference - right.amountDifference ||
      left.dateDistanceDays - right.dateDistanceDays ||
      right.id - left.id,
    )
    .slice(0, 200);

  return (
    <main className="p-8">
      <div className="max-w-6xl">
        <Link
          href={`/banki/${bankAccountId}/afstemming#transaction-${transactionId}`}
          className="text-sm font-semibold text-blue-700 hover:underline"
        >
          ← {t.manualBack}
        </Link>

        <h1 className="mt-4 text-2xl font-bold">⚖️ {t.manualTitle}</h1>
        <p className="mt-2 max-w-4xl text-sm text-gray-600">{t.manualHelp}</p>

        {showConfirmedBanner ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <div className="font-semibold">✓ {t.manualConfirmedTitle}</div>
            <div className="mt-1 text-xs text-emerald-800">{t.manualConfirmedHelp}</div>
          </div>
        ) : null}

        <section className="mt-6 rounded-xl border border-blue-200 bg-blue-50/50 p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-blue-800">
            {t.manualBankTransaction}
          </div>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-semibold">{bank.text}</div>
              <div className="mt-1 text-sm text-gray-600">
                {formatDate(bank.date)}
                {bank.reference ? ` · ${t.reference}: ${bank.reference}` : ""}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {bank.bankAccount.bankName} · {bank.bankAccount.accountNumber ?? "—"}
              </div>
            </div>
            <div className="text-xl font-bold">{formatNumber(bankAmount)} kr.</div>
          </div>
        </section>

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
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
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
              {documents.map((document) => {
                const documentConfirmable =
                  access.canReconcileBookkeeping &&
                  bank.status !== "RECONCILED" &&
                  document.exactAmount &&
                  !document.hasPrimaryEvent;

                return (
                  <article
                    key={document.id}
                    className={`rounded-xl border p-4 ${document.exactAmount ? "border-cyan-200 bg-cyan-50/30" : "bg-white"}`}
                  >
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                            {(document.documentType ?? "UNKNOWN").toUpperCase()}
                          </span>
                          {document.exactAmount ? (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                              {t.manualAmountSame}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-2 font-semibold">
                          {document.merchantName || document.summary || `${t.sourceReceipt} #${document.receiptId}`}
                        </div>
                        <div className="mt-1 text-sm text-gray-600">
                          {formatDate(document.effectiveDate)} · {formatNumber(document.amount)} kr.
                          {Number.isFinite(document.dateDistanceDays)
                            ? ` · ${t.reviewedDocumentCandidateDateDistance}: ${document.dateDistanceDays} ${t.reviewedDocumentCandidateDays}`
                            : ""}
                        </div>
                        {document.receiptNumber ? (
                          <div className="mt-1 text-sm text-gray-600">
                            {t.reference}: {document.receiptNumber}
                          </div>
                        ) : null}
                        {document.canonicalIdentifiers.length ? (
                          <div className="mt-1 text-sm text-gray-600">
                            {t.manualCanonicalIdentifiers}: {document.canonicalIdentifiers.join(" · ")}
                          </div>
                        ) : null}
                        {!document.exactAmount ? (
                          <div className="mt-2 text-xs text-amber-800">
                            {t.manualAmountDifference}: {formatNumber(document.amountDifference)} kr. · {t.manualExactAmountRequired}
                          </div>
                        ) : null}
                        {document.hasPrimaryEvent ? (
                          <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-800">
                              {t.manualPrimaryEventTitle}
                            </div>
                            <div className="mt-1 text-xs text-indigo-800">
                              {t.manualPrimaryEventBlocked}
                            </div>
                            <div className="mt-3 space-y-3">
                              {document.financialEventLinks.map((link) => {
                                const event = link.event;
                                const eventAmount = event.amount === null ? null : Number(event.amount);
                                const eventAmountMatches =
                                  eventAmount !== null &&
                                  Number.isFinite(eventAmount) &&
                                  Math.abs(Math.abs(eventAmount) - Math.abs(bankAmount)) < 0.005;
                                const eventDirectionMatches =
                                  eventAmount !== null &&
                                  ((event.eventType === "CHARGE" && eventAmount > 0 && bankAmount < 0) ||
                                    (event.eventType === "CREDIT" && eventAmount < 0 && bankAmount > 0));
                                const confirmedPayments = event.payments;
                                const confirmedPaidAmount = confirmedPayments.reduce(
                                  (sum, payment) => sum + Number(payment.amount),
                                  0,
                                );
                                const currentPairPayment = confirmedPayments.find(
                                  (payment) => payment.bankTransactionId === bank.id,
                                );
                                const eventAbsoluteAmount =
                                  eventAmount !== null && Number.isFinite(eventAmount)
                                    ? Math.abs(eventAmount)
                                    : null;
                                const remainingAmount = eventAbsoluteAmount === null
                                  ? null
                                  : Math.max(0, eventAbsoluteAmount - confirmedPaidAmount);
                                const enoughRemaining =
                                  remainingAmount !== null &&
                                  remainingAmount + 0.005 >= Math.abs(bankAmount);
                                const canConfirmEvent =
                                  access.canReconcileBookkeeping &&
                                  bank.status !== "RECONCILED" &&
                                  !currentPairPayment &&
                                  enoughRemaining &&
                                  document.exactAmount &&
                                  eventAmountMatches &&
                                  eventDirectionMatches &&
                                  event.currency === "ISK" &&
                                  link.source === "REVIEWED_DOCUMENT";
                                const exactEventReference = Boolean(
                                  bank.reference &&
                                  event.externalReference &&
                                  bank.reference.trim().toUpperCase() ===
                                    event.externalReference.trim().toUpperCase(),
                                );

                                return (
                                  <div key={event.id} className="rounded-lg border border-indigo-100 bg-white p-3">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                      <div>
                                        <div className="font-semibold text-gray-900">
                                          {event.title || `${t.financialEvent} #${event.id}`}
                                        </div>
                                        <div className="mt-1 text-sm text-gray-600">
                                          #{event.id} · {event.eventType === "CREDIT" ? t.eventCredit : t.eventCharge}
                                          {event.eventDate ? ` · ${formatDate(event.eventDate)}` : ""}
                                          {eventAmount !== null && Number.isFinite(eventAmount)
                                            ? ` · ${formatNumber(Math.abs(eventAmount))} kr.`
                                            : ""}
                                        </div>
                                        {event.externalReference ? (
                                          <div className="mt-1 text-sm text-gray-600">
                                            {t.reference}: {event.externalReference}
                                            {exactEventReference ? (
                                              <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                                                {t.manualPrimaryEventReferenceMatches}
                                              </span>
                                            ) : null}
                                          </div>
                                        ) : null}
                                        {event.liabilityAccount ? (
                                          <div className="mt-1 text-sm text-gray-600">
                                            {t.account}: {event.liabilityAccount.number} · {event.liabilityAccount.name}
                                          </div>
                                        ) : null}
                                        {document.dateDistanceDays > 30 ? (
                                          <div className="mt-2 text-xs text-indigo-700">
                                            {t.manualPrimaryEventLongLead}
                                          </div>
                                        ) : null}
                                        {eventAbsoluteAmount !== null && confirmedPayments.length > 0 ? (
                                          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                                            <div className="font-semibold">{t.manualPrimaryEventConfirmedPayments}</div>
                                            <div className="mt-1">
                                              {t.manualPrimaryEventPaid}: {formatNumber(confirmedPaidAmount)} kr.
                                              {remainingAmount !== null
                                                ? ` · ${t.manualPrimaryEventRemaining}: ${formatNumber(remainingAmount)} kr.`
                                                : ""}
                                            </div>
                                            <div className="mt-2 space-y-1">
                                              {confirmedPayments.map((payment) => (
                                                <div key={payment.id} className="flex flex-wrap items-center gap-2">
                                                  <span>
                                                    {formatDate(payment.bankTransaction.date)} · {payment.bankTransaction.text}
                                                    {payment.bankTransaction.reference
                                                      ? ` · ${t.reference}: ${payment.bankTransaction.reference}`
                                                      : ""}
                                                    {` · ${formatNumber(Number(payment.amount))} kr.`}
                                                  </span>
                                                  <Link
                                                    href={`/banki/${payment.bankTransaction.bankAccountId}/afstemming/handvirkt?transaction=${payment.bankTransaction.id}&amount=same&days=90`}
                                                    className="font-semibold text-blue-700 hover:underline"
                                                  >
                                                    {t.manualPrimaryEventOpenPayment}
                                                  </Link>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                      <div className="flex flex-wrap gap-2">
                                        {currentPairPayment ? (
                                          <span className="rounded-lg bg-green-100 px-3 py-2 text-xs font-semibold text-green-800">
                                            {t.manualPrimaryEventAlreadyReconciled}
                                          </span>
                                        ) : canConfirmEvent ? (
                                          <ConfirmManualFinancialEventMatchForm
                                            companyId={companyId}
                                            bankTransactionId={bank.id}
                                            eventId={event.id}
                                            documentId={document.id}
                                            confirmLabel={t.manualPrimaryEventConfirm}
                                            pendingLabel={t.manualPrimaryEventConfirming}
                                            overAllocationLabel={t.manualPrimaryEventOverAllocation}
                                            successHref={successHref}
                                          />
                                        ) : confirmedPayments.length > 0 && !enoughRemaining ? (
                                          <span className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900">
                                            {t.manualPrimaryEventAlreadyAllocated}
                                          </span>
                                        ) : (
                                          <span className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-600">
                                            {t.manualPrimaryEventNotConfirmable}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-start gap-2 md:justify-end">
                        <Link
                          href={`/fylgiskjol/${document.receiptId}?document=${document.id}`}
                          className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                        >
                          {t.reviewedDocumentCandidateOpenDocument}
                        </Link>
                        {documentConfirmable ? (
                          <ConfirmReviewedDocumentMatchForm
                            companyId={companyId}
                            bankTransactionId={bank.id}
                            documentId={document.id}
                            confirmLabel={t.reviewedDocumentCandidateConfirm}
                            pendingLabel={t.reviewedDocumentCandidateConfirming}
                            successHref={successHref}
                          />
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
