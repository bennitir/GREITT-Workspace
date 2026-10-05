import type { PrismaBankDiagnosticSnapshot } from "@/lib/financial-reconciliation/diagnostics-prisma";

type Labels = {
  title: string;
  help: string;
  complete: string;
  partial: string;
  confirmed: string;
  ready: string;
  review: string;
  unresolved: string;
  issues: string;
  noCandidate: string;
  noCandidateHelp: string;
  coverageTitle: string;
  bookingCoverage: string;
  eventCoverage: string;
  bothCoverage: string;
  documentBridgeTitle: string;
  documentInventory: string;
  reviewedDocuments: string;
  eligibleDocuments: string;
  primaryEvents: string;
  primaryEventsHelp: string;
  eligibleWithoutEvent: string;
  separateScheduleFlow: string;
  exclusionTitle: string;
  exclusionHelp: string;
  reviewedOutsideStandardFlow: string;
  noExclusions: string;
  exclusionDocumentRole: string;
  exclusionManualClassification: string;
  exclusionInvalidAmount: string;
  exclusionUnsupportedType: string;
  exclusionInvoiceLinkCount: string;
  exclusionPaymentSchedule: string;
  unsupportedTypesTitle: string;
  unsupportedTypesHelp: string;
  unsupportedTypeUnknown: string;
  invoiceLinkBreakdownTitle: string;
  invoiceLinkBreakdownHelp: string;
  invoiceLinkCountLabel: string;
  invoiceZeroContextTitle: string;
  invoiceZeroContextHelp: string;
  invoiceZeroContextUnknownMerchant: string;
  amountMismatchFlowTitle: string;
  amountMismatchFlowHelp: string;
  bankFlowBankFee: string;
  bankFlowInterest: string;
  bankFlowReversal: string;
  bankFlowCardPurchase: string;
  bankFlowCreditCardMovement: string;
  bankFlowTransfer: string;
  bankFlowLoanPayment: string;
  bankFlowIdentifiedInflow: string;
  bankFlowIdentifiedOutflow: string;
  bankFlowUnknown: string;
  noCandidateBreakdownTitle: string;
  noCandidateBreakdownHelp: string;
  flowSourceIncomplete: string;
  flowNoEligibleTargets: string;
  flowAmountMismatch: string;
  flowBookingContext: string;
  flowEventDirection: string;
  flowEventDate: string;
  flowEventTemporal: string;
  flowMixedLateRejection: string;
  flowOther: string;
  reviewedAmountBridgeTitle: string;
  reviewedAmountBridgeHelp: string;
  reviewedAmountGroup: string;
  reviewedAmountFound: string;
  reviewedAmountNearDate: string;
  reviewedAmountNotFound: string;
  reviewedAmountUnique: string;
  reviewedAmountMultiple: string;
  reviewedAmountStateTitle: string;
  reviewedAmountStateEligible: string;
  reviewedAmountStateSchedule: string;
  reviewedAmountStateUnsupportedType: string;
  reviewedAmountStateInvoiceLink: string;
  reviewedAmountStateRole: string;
  reviewedAmountStateManual: string;
  reviewedAmountStateOther: string;
  reviewedAmountExamplesTitle: string;
  reviewedAmountExamplesHelp: string;
  reviewedAmountDocumentLabel: string;
  reviewedAmountEligibilityEligible: string;
  reviewedAmountEligibilityIneligible: string;
  reviewedAmountEligibilitySchedule: string;
  reviewedAmountEligibilityNotEvaluated: string;
};

type Props = {
  snapshot: PrismaBankDiagnosticSnapshot;
  labels: Labels;
};

function percentage(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function CountCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] opacity-75">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function CoverageBar({
  label,
  value,
  total,
  barClassName,
}: {
  label: string;
  value: number;
  total: number;
  barClassName: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-500">
          {value} / {total}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${barClassName}`}
          style={{ width: `${percentage(value, total)}%` }}
        />
      </div>
    </div>
  );
}

type NoCandidateFlow =
  | "SOURCE_INCOMPLETE"
  | "NO_ELIGIBLE_TARGETS"
  | "AMOUNT_MISMATCH"
  | "BOOKING_CONTEXT"
  | "EVENT_DIRECTION"
  | "EVENT_DATE"
  | "EVENT_TEMPORAL"
  | "MIXED_LATE_REJECTION"
  | "OTHER";

function classifyNoCandidateFlow(
  row: PrismaBankDiagnosticSnapshot["transactions"][number],
): NoCandidateFlow {
  if (
    row.booking.availability !== "AVAILABLE" ||
    row.events.availability !== "AVAILABLE"
  ) {
    return "SOURCE_INCOMPLETE";
  }

  const bookingEligible = row.booking.eligibleRowCount ?? 0;
  const bookingAmount = row.booking.signedAmountMatchingRowCount ?? 0;
  const eventEligible = row.events.eligibleEventCount ?? 0;
  const eventAmount = row.events.amountCompatibleCount ?? 0;
  const eventDirection = row.events.directionCompatibleCount ?? 0;
  const eventDate = row.events.dateWindowCompatibleCount ?? 0;
  const eventTemporal = row.events.temporalCompatibleCount ?? 0;

  if (bookingEligible === 0 && eventEligible === 0) {
    return "NO_ELIGIBLE_TARGETS";
  }
  if (bookingAmount === 0 && eventAmount === 0) {
    return "AMOUNT_MISMATCH";
  }
  if (bookingAmount > 0 && eventAmount > 0) {
    return "MIXED_LATE_REJECTION";
  }
  if (bookingAmount > 0) {
    return "BOOKING_CONTEXT";
  }
  if (eventAmount > 0 && eventDirection === 0) {
    return "EVENT_DIRECTION";
  }
  if (eventDirection > 0 && eventDate === 0) {
    return "EVENT_DATE";
  }
  if (eventDate > 0 && eventTemporal === 0) {
    return "EVENT_TEMPORAL";
  }
  return "OTHER";
}

export function ReconciliationDiagnosticOverview({ snapshot, labels }: Props) {
  const total = snapshot.total.transactionCount;
  const confirmed = snapshot.overall.CONFIRMED.transactionCount;
  const ready = snapshot.overall.SINGLE_TARGET_CANDIDATE.transactionCount;
  const review =
    snapshot.overall.MULTIPLE_TARGET_CANDIDATES.transactionCount +
    snapshot.overall.CANDIDATES_BLOCKED.transactionCount;
  const unresolved = snapshot.overall.UNRESOLVED.transactionCount;
  const issues =
    snapshot.overall.DATA_CONFLICT.transactionCount +
    snapshot.overall.SOURCE_ERROR.transactionCount +
    snapshot.overall.UNSUPPORTED.transactionCount;

  const bookingCoverage =
    snapshot.coverage.BOOKING_ONLY.transactionCount +
    snapshot.coverage.BOTH.transactionCount;
  const eventCoverage =
    snapshot.coverage.EVENT_ONLY.transactionCount +
    snapshot.coverage.BOTH.transactionCount;
  const bothCoverage = snapshot.coverage.BOTH.transactionCount;

  const documents = snapshot.companyDocumentInventory.documents;
  const eligibility = snapshot.companyDocumentInventory.countsByEligibility;
  const eligibleDocuments = eligibility?.ELIGIBLE ?? 0;
  const separateScheduleFlow = eligibility?.SEPARATE_SCHEDULE_FLOW ?? 0;
  const primaryEvents = documents.filter(
    (document) => document.materialization.hasPrimaryEvent === true,
  ).length;
  const eligibleWithoutEvent = documents.filter(
    (document) =>
      document.materialization.eligibility === "ELIGIBLE" &&
      document.materialization.hasPrimaryEvent === false,
  ).length;
  const reviewedDocuments = documents.filter(
    (document) => document.reviewedAt !== null,
  );
  const reviewedOutsideStandardFlow = reviewedDocuments.filter(
    (document) =>
      document.materialization.eligibility === "INELIGIBLE" ||
      document.materialization.eligibility === "SEPARATE_SCHEDULE_FLOW",
  ).length;

  const exclusionRows = [
    {
      code: "DOCUMENT_ROLE_INELIGIBLE",
      label: labels.exclusionDocumentRole,
    },
    {
      code: "MANUAL_CLASSIFICATION_EXCLUDED",
      label: labels.exclusionManualClassification,
    },
    {
      code: "DOCUMENT_AMOUNT_INVALID",
      label: labels.exclusionInvalidAmount,
    },
    {
      code: "DOCUMENT_TYPE_UNSUPPORTED",
      label: labels.exclusionUnsupportedType,
    },
    {
      code: "INVOICE_LINK_COUNT_NOT_ONE",
      label: labels.exclusionInvoiceLinkCount,
    },
    {
      code: "PAYMENT_SCHEDULE_SEPARATE_FLOW",
      label: labels.exclusionPaymentSchedule,
    },
  ] as const;

  const exclusionCounts = exclusionRows
    .map((row) => ({
      ...row,
      count: reviewedDocuments.filter((document) =>
        document.materialization.reasons.some((reason) => reason.code === row.code),
      ).length,
    }))
    .filter((row) => row.count > 0);

  const materializationObservations =
    snapshot.source.materializationObservations;
  const unsupportedTypeCounts = (
    materializationObservations.unsupportedDocumentTypes ?? []
  ).map((row) => ({
    documentType: row.documentType || labels.unsupportedTypeUnknown,
    count: row.count,
  }));
  const unsupportedTypeTotal = unsupportedTypeCounts.reduce(
    (sum, item) => sum + item.count,
    0,
  );
  const invoiceLinkCountsNotOne =
    materializationObservations.invoiceLinkCountsNotOne ?? [];
  const invoiceLinkZeroContexts =
    materializationObservations.invoiceLinkZeroContexts ?? [];

  const flowObservations = snapshot.source.reconciliationFlowObservations;
  const reviewedAmountObservations = snapshot.source.reviewedDocumentAmountObservations;
  const reviewedAmountStateLabels = {
    ELIGIBLE: labels.reviewedAmountStateEligible,
    SEPARATE_SCHEDULE_FLOW: labels.reviewedAmountStateSchedule,
    DOCUMENT_TYPE_UNSUPPORTED: labels.reviewedAmountStateUnsupportedType,
    INVOICE_LINK_COUNT_NOT_ONE: labels.reviewedAmountStateInvoiceLink,
    DOCUMENT_ROLE_INELIGIBLE: labels.reviewedAmountStateRole,
    MANUAL_CLASSIFICATION_EXCLUDED: labels.reviewedAmountStateManual,
    OTHER_INELIGIBLE: labels.reviewedAmountStateOther,
  } as const;
  const reviewedAmountEligibilityLabels = {
    ELIGIBLE: labels.reviewedAmountEligibilityEligible,
    INELIGIBLE: labels.reviewedAmountEligibilityIneligible,
    SEPARATE_SCHEDULE_FLOW: labels.reviewedAmountEligibilitySchedule,
    NOT_EVALUATED: labels.reviewedAmountEligibilityNotEvaluated,
  } as const;
  const bankFlowLabels = {
    BANK_FEE: labels.bankFlowBankFee,
    INTEREST: labels.bankFlowInterest,
    REVERSAL: labels.bankFlowReversal,
    CARD_PURCHASE: labels.bankFlowCardPurchase,
    CARD_ACCOUNT_MOVEMENT: labels.bankFlowCreditCardMovement,
    TRANSFER: labels.bankFlowTransfer,
    LOAN_PAYMENT: labels.bankFlowLoanPayment,
    UNKNOWN: labels.bankFlowUnknown,
  } as const;

  const noCandidateRows = snapshot.transactions.filter(
    (row) =>
      row.overall.candidateTargetCount === 0 &&
      row.confirmed.state === "NONE",
  );
  const noCandidateFlowOrder: NoCandidateFlow[] = [
    "SOURCE_INCOMPLETE",
    "NO_ELIGIBLE_TARGETS",
    "AMOUNT_MISMATCH",
    "BOOKING_CONTEXT",
    "EVENT_DIRECTION",
    "EVENT_DATE",
    "EVENT_TEMPORAL",
    "MIXED_LATE_REJECTION",
    "OTHER",
  ];
  const noCandidateFlowLabels: Record<NoCandidateFlow, string> = {
    SOURCE_INCOMPLETE: labels.flowSourceIncomplete,
    NO_ELIGIBLE_TARGETS: labels.flowNoEligibleTargets,
    AMOUNT_MISMATCH: labels.flowAmountMismatch,
    BOOKING_CONTEXT: labels.flowBookingContext,
    EVENT_DIRECTION: labels.flowEventDirection,
    EVENT_DATE: labels.flowEventDate,
    EVENT_TEMPORAL: labels.flowEventTemporal,
    MIXED_LATE_REJECTION: labels.flowMixedLateRejection,
    OTHER: labels.flowOther,
  };
  const noCandidateFlowCounts = noCandidateFlowOrder
    .map((flow) => ({
      flow,
      label: noCandidateFlowLabels[flow],
      count: noCandidateRows.filter(
        (row) => classifyNoCandidateFlow(row) === flow,
      ).length,
    }))
    .filter((row) => row.count > 0);

  const segments = [
    { value: confirmed, className: "bg-emerald-500" },
    { value: ready, className: "bg-sky-500" },
    { value: review, className: "bg-amber-400" },
    { value: unresolved, className: "bg-slate-300" },
    { value: issues, className: "bg-rose-400" },
  ].filter((segment) => segment.value > 0);

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-5 py-5 text-white sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">
              bank-diagnostics-v3
            </p>
            <h3 className="mt-1 text-xl font-semibold">{labels.title}</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">
              {labels.help}
            </p>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              snapshot.completeness === "COMPLETE"
                ? "border-emerald-300/30 bg-emerald-400/10 text-emerald-200"
                : "border-amber-300/30 bg-amber-400/10 text-amber-100"
            }`}
          >
            {snapshot.completeness === "COMPLETE"
              ? labels.complete
              : labels.partial}
          </span>
        </div>

        <div className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-white/10">
          {segments.map((segment, index) => (
            <div
              key={`${segment.className}-${index}`}
              className={segment.className}
              style={{ width: `${percentage(segment.value, total)}%` }}
            />
          ))}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <CountCard
            label={labels.confirmed}
            value={confirmed}
            className="border-emerald-200 bg-emerald-50 text-emerald-900"
          />
          <CountCard
            label={labels.ready}
            value={ready}
            className="border-sky-200 bg-sky-50 text-sky-900"
          />
          <CountCard
            label={labels.review}
            value={review}
            className="border-amber-200 bg-amber-50 text-amber-950"
          />
          <CountCard
            label={labels.unresolved}
            value={unresolved}
            className="border-slate-200 bg-slate-50 text-slate-900"
          />
          <CountCard
            label={labels.issues}
            value={issues}
            className="border-rose-200 bg-rose-50 text-rose-900"
          />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-slate-200 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="font-semibold text-slate-950">{labels.coverageTitle}</h4>
                <p className="mt-1 text-sm text-slate-500">{labels.noCandidateHelp}</p>
              </div>
              <div className="rounded-lg bg-slate-950 px-3 py-2 text-right text-white">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-300">
                  {labels.noCandidate}
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {snapshot.noCandidateUnconfirmed.transactionCount}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <CoverageBar
                label={labels.bookingCoverage}
                value={bookingCoverage}
                total={total}
                barClassName="bg-violet-500"
              />
              <CoverageBar
                label={labels.eventCoverage}
                value={eventCoverage}
                total={total}
                barClassName="bg-indigo-500"
              />
              <CoverageBar
                label={labels.bothCoverage}
                value={bothCoverage}
                total={total}
                barClassName="bg-emerald-500"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 sm:p-5">
            <h4 className="font-semibold text-slate-950">
              {labels.documentBridgeTitle}
            </h4>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">{labels.documentInventory}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">
                  {documents.length}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-500">{labels.reviewedDocuments}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">
                  {reviewedDocuments.length}
                </p>
              </div>
              <div className="rounded-lg bg-sky-50 p-3">
                <p className="text-xs text-sky-700">{labels.eligibleDocuments}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-sky-950">
                  {eligibleDocuments}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3">
                <p className="text-xs text-emerald-700">{labels.primaryEvents}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-950">
                  {primaryEvents}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-emerald-800/80">
                  {labels.primaryEventsHelp}
                </p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3">
                <p className="text-xs text-amber-700">{labels.eligibleWithoutEvent}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-950">
                  {eligibleWithoutEvent}
                </p>
              </div>
              <div className="rounded-lg bg-indigo-50 p-3">
                <p className="text-xs text-indigo-700">{labels.separateScheduleFlow}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-indigo-950">
                  {separateScheduleFlow}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h4 className="font-semibold text-slate-950">{labels.exclusionTitle}</h4>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                {labels.exclusionHelp}
              </p>
            </div>
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-right text-amber-950">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                {labels.reviewedOutsideStandardFlow}
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {reviewedOutsideStandardFlow}
              </p>
            </div>
          </div>

          {exclusionCounts.length ? (
            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {exclusionCounts.map((row) => (
                <div key={row.code} className="rounded-lg bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-700">{row.label}</span>
                    <span className="font-semibold tabular-nums text-slate-950">
                      {row.count}
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-slate-700"
                      style={{
                        width: `${percentage(row.count, Math.max(1, reviewedOutsideStandardFlow))}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              {labels.noExclusions}
            </p>
          )}
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-slate-200 p-4 sm:p-5">
            <h4 className="font-semibold text-slate-950">
              {labels.unsupportedTypesTitle}
            </h4>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {labels.unsupportedTypesHelp}
            </p>
            {unsupportedTypeCounts.length ? (
              <div className="mt-4 space-y-3">
                {unsupportedTypeCounts.map((row) => (
                  <div key={row.documentType} className="rounded-lg bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <code className="break-all text-xs font-semibold text-slate-700">
                        {row.documentType}
                      </code>
                      <span className="text-lg font-semibold tabular-nums text-slate-950">
                        {row.count}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-violet-500"
                        style={{
                          width: `${percentage(
                            row.count,
                            Math.max(1, unsupportedTypeTotal),
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                {labels.noExclusions}
              </p>
            )}
            <div className="mt-5 border-t border-slate-100 pt-5">
              <h5 className="text-sm font-semibold text-slate-950">
                {labels.invoiceLinkBreakdownTitle}
              </h5>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {labels.invoiceLinkBreakdownHelp}
              </p>
              {invoiceLinkCountsNotOne.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {invoiceLinkCountsNotOne.map((row) => (
                    <div
                      key={row.invoiceLinkCount}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <p className="text-xs text-slate-500">
                        {row.invoiceLinkCount} {labels.invoiceLinkCountLabel}
                      </p>
                      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-950">
                        {row.count}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  {labels.noExclusions}
                </p>
              )}

              {invoiceLinkZeroContexts.length ? (
                <div className="mt-5 border-t border-slate-100 pt-5">
                  <h5 className="text-sm font-semibold text-slate-950">
                    {labels.invoiceZeroContextTitle}
                  </h5>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {labels.invoiceZeroContextHelp}
                  </p>
                  <div className="mt-3 space-y-2">
                    {invoiceLinkZeroContexts.map((row, index) => (
                      <div
                        key={`${row.documentType ?? "unknown"}-${row.merchantName ?? "unknown"}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {row.merchantName ?? labels.invoiceZeroContextUnknownMerchant}
                          </p>
                          <code className="text-[11px] text-slate-500">
                            {row.documentType ?? labels.unsupportedTypeUnknown}
                          </code>
                        </div>
                        <span className="text-base font-semibold tabular-nums text-slate-950">
                          {row.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="font-semibold text-slate-950">
                  {labels.noCandidateBreakdownTitle}
                </h4>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {labels.noCandidateBreakdownHelp}
                </p>
              </div>
              <span className="rounded-lg bg-slate-950 px-3 py-2 text-lg font-semibold tabular-nums text-white">
                {noCandidateRows.length}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {noCandidateFlowCounts.map((row) => (
                <div key={row.flow}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-700">{row.label}</span>
                    <span className="font-semibold tabular-nums text-slate-950">
                      {row.count}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{
                        width: `${percentage(
                          row.count,
                          Math.max(1, noCandidateRows.length),
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {flowObservations.amountMismatchFlowHints.length ? (
              <div className="mt-5 border-t border-slate-100 pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h5 className="text-sm font-semibold text-slate-950">
                      {labels.amountMismatchFlowTitle}
                    </h5>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {labels.amountMismatchFlowHelp}
                    </p>
                  </div>
                  <span className="rounded-lg bg-indigo-50 px-3 py-2 text-lg font-semibold tabular-nums text-indigo-950">
                    {flowObservations.amountMismatchNoCandidateCount}
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {flowObservations.amountMismatchFlowHints.map((row) => (
                    <div key={row.flow}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-slate-700">
                          {bankFlowLabels[row.flow]}
                        </span>
                        <span className="font-semibold tabular-nums text-slate-950">
                          {row.count}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-sky-500"
                          style={{
                            width: `${percentage(
                              row.count,
                              Math.max(1, flowObservations.amountMismatchNoCandidateCount),
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {reviewedAmountObservations.availability === "AVAILABLE" ? (
          <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h4 className="font-semibold text-slate-950">
                  {labels.reviewedAmountBridgeTitle}
                </h4>
                <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
                  {labels.reviewedAmountBridgeHelp}
                </p>
              </div>
              <div className="rounded-lg bg-slate-950 px-3 py-2 text-right text-white">
                <p className="text-[11px] uppercase tracking-[0.12em] text-slate-300">
                  {labels.reviewedAmountGroup}
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {reviewedAmountObservations.amountMismatchNoCandidateCount}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <CountCard
                label={labels.reviewedAmountFound}
                value={reviewedAmountObservations.reviewedAmountMatchTransactionCount ?? 0}
                className="border-cyan-200 bg-white text-cyan-950"
              />
              <CountCard
                label={labels.reviewedAmountNearDate}
                value={reviewedAmountObservations.reviewedAmountNearDateTransactionCount ?? 0}
                className="border-sky-200 bg-white text-sky-950"
              />
              <CountCard
                label={labels.reviewedAmountUnique}
                value={reviewedAmountObservations.reviewedAmountNearDateUniqueTransactionCount ?? 0}
                className="border-emerald-200 bg-white text-emerald-950"
              />
              <CountCard
                label={labels.reviewedAmountNotFound}
                value={reviewedAmountObservations.noReviewedAmountMatchTransactionCount ?? 0}
                className="border-slate-200 bg-white text-slate-900"
              />
            </div>

            {(reviewedAmountObservations.reviewedAmountNearDateMultipleTransactionCount ?? 0) > 0 ? (
              <p className="mt-3 text-xs text-slate-600">
                {labels.reviewedAmountMultiple}: {reviewedAmountObservations.reviewedAmountNearDateMultipleTransactionCount}
              </p>
            ) : null}

            {reviewedAmountObservations.nearDateStateCounts?.length ? (
              <div className="mt-5 border-t border-cyan-100 pt-5">
                <h5 className="text-sm font-semibold text-slate-950">
                  {labels.reviewedAmountStateTitle}
                </h5>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {reviewedAmountObservations.nearDateStateCounts.map((row) => (
                    <div key={row.state} className="rounded-lg border border-cyan-100 bg-white p-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-slate-700">
                          {reviewedAmountStateLabels[row.state]}
                        </span>
                        <span className="font-semibold tabular-nums text-slate-950">
                          {row.count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {reviewedAmountObservations.examples?.length ? (
              <details className="mt-5 border-t border-cyan-100 pt-5">
                <summary className="cursor-pointer text-sm font-semibold text-slate-950">
                  {labels.reviewedAmountExamplesTitle}
                </summary>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {labels.reviewedAmountExamplesHelp}
                </p>
                <div className="mt-3 space-y-3">
                  {reviewedAmountObservations.examples.map((example) => (
                    <div
                      key={example.bankTransactionId}
                      className="rounded-lg border border-cyan-100 bg-white p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">
                          #{example.bankTransactionId} · {example.bankText || "—"}
                        </p>
                        <code className="text-xs text-slate-600">
                          {example.bankDate?.slice(0, 10) ?? "—"} · {example.bankAmount}
                        </code>
                      </div>
                      <div className="mt-2 space-y-2">
                        {example.matches.map((match) => (
                          <div
                            key={match.documentId}
                            className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700"
                          >
                            <p className="font-medium text-slate-900">
                              {labels.reviewedAmountDocumentLabel} #{match.receiptId} · {match.merchantName ?? "—"} · {match.totalAmount}
                            </p>
                            <p className="mt-0.5">
                              {match.effectiveDate?.slice(0, 10) ?? "—"} · {match.documentType ?? "—"} · {reviewedAmountEligibilityLabels[match.eligibility]}
                            </p>
                            {match.reasonCodes.length ? (
                              <code className="mt-1 block break-words text-[11px] text-slate-500">
                                {match.reasonCodes.join(", ")}
                              </code>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
