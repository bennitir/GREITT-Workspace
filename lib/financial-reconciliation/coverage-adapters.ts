import {
  buildReconciliationCoverageSnapshot,
  type ReconciliationCoverageItem,
  type ReconciliationCoverageMode,
  type ReconciliationCoverageSnapshot,
} from "./coverage";
import type { DiagnosticSnapshot } from "./diagnostics-contract";
import {
  classificationExcludesBusinessCoverage,
  classificationExcludesDocumentCoverage,
  type FinancialSourceClassificationCode,
} from "./source-classification";

export type CardCoverageResolution = {
  paymentCardTransactionId: number;
  state: "UNIQUE_STRONG" | "UNIQUE_POSSIBLE" | "AMBIGUOUS";
  candidates: Array<{ documentId: number }>;
};

export type CardCoverageTransaction = {
  id: number;
  amount: string | number;
  status: string;
};

export type CardCoverageDocument = {
  id: number;
  amount: string | number | null;
  scope: "IN_SCOPE" | "EXCLUDED" | "UNKNOWN";
};

function numericSign(value: string | number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed === 0 ? 0 : parsed < 0 ? -1 : 1;
}

function cardSourceState(input: {
  mode: ReconciliationCoverageMode;
  transaction: CardCoverageTransaction;
  resolution: CardCoverageResolution | undefined;
  confirmed: boolean;
}): ReconciliationCoverageItem["state"] {
  if (input.mode === "EXCLUDED") return "EXCLUDED";
  if (input.confirmed) return "CONFIRMED";

  if (input.resolution?.state === "UNIQUE_STRONG") return "STRONG_UNCONFIRMED";
  if (input.resolution?.state === "AMBIGUOUS") return "AMBIGUOUS";
  if (input.resolution?.state === "UNIQUE_POSSIBLE") return "UNRESOLVED";

  // A generic RECONCILED flag can later be used by another card flow. Without
  // a confirmed CARD_TO_REVIEWED_DOCUMENT participant we do not relabel it.
  if (input.transaction.status === "RECONCILED") return "UNKNOWN";

  const sign = numericSign(input.transaction.amount);
  if (sign === 0) return "EXCLUDED";
  if (sign === -1) return "UNRESOLVED";

  // Positive card rows may be payments, refunds or credits. The coverage layer
  // must not invent a document obligation without a flow-specific decision.
  return "UNKNOWN";
}

function candidateDocumentState(
  documentId: number,
  resolutions: readonly CardCoverageResolution[],
): ReconciliationCoverageItem["state"] | null {
  const touching = resolutions.filter((resolution) =>
    resolution.candidates.some((candidate) => candidate.documentId === documentId),
  );
  if (!touching.length) return null;
  if (touching.some((resolution) => resolution.state === "AMBIGUOUS")) return "AMBIGUOUS";
  if (touching.some((resolution) => resolution.state === "UNIQUE_STRONG")) {
    return "STRONG_UNCONFIRMED";
  }
  return "UNRESOLVED";
}

/**
 * Payment-card -> reviewed-document coverage adapter.
 *
 * This adapter deliberately does not decide whether a personal/mixed-use card
 * is subject to a completeness requirement. The caller supplies mode. Card
 * purchases can still be shown as open work in INFORMATIONAL mode without
 * turning them into a compliance alarm.
 */
export function buildCardReviewedDocumentCoverageSnapshot(input: {
  mode: ReconciliationCoverageMode;
  transactions: readonly CardCoverageTransaction[];
  documents: readonly CardCoverageDocument[];
  resolutions: readonly CardCoverageResolution[];
  confirmedTransactionIds?: readonly number[];
  confirmedDocumentIds?: readonly number[];
  classifications?: readonly {
    paymentCardTransactionId: number;
    classification: FinancialSourceClassificationCode;
  }[];
}): ReconciliationCoverageSnapshot {
  const resolutionByTransactionId = new Map(
    input.resolutions.map((resolution) => [resolution.paymentCardTransactionId, resolution]),
  );
  const confirmedTransactions = new Set(input.confirmedTransactionIds ?? []);
  const confirmedDocuments = new Set(input.confirmedDocumentIds ?? []);
  const classificationByTransactionId = new Map(
    (input.classifications ?? []).map((item) => [
      item.paymentCardTransactionId,
      item.classification,
    ]),
  );

  const source: ReconciliationCoverageItem[] = input.transactions.map((transaction) => {
    const classification = classificationByTransactionId.get(transaction.id);
    return {
      key: `PAYMENT_CARD_TRANSACTION:${transaction.id}`,
      amount: transaction.amount,
      currency: "ISK",
      state: classificationExcludesDocumentCoverage(classification)
        ? "EXCLUDED"
        : cardSourceState({
            mode: input.mode,
            transaction,
            resolution: resolutionByTransactionId.get(transaction.id),
            confirmed: confirmedTransactions.has(transaction.id),
          }),
    };
  });

  const target: ReconciliationCoverageItem[] = input.documents.map((document) => {
    let state: ReconciliationCoverageItem["state"];
    if (input.mode === "EXCLUDED") {
      state = "EXCLUDED";
    } else if (confirmedDocuments.has(document.id)) {
      state = "CONFIRMED";
    } else {
      state = candidateDocumentState(document.id, input.resolutions) ??
        (document.scope === "IN_SCOPE"
          ? "UNRESOLVED"
          : document.scope === "EXCLUDED"
            ? "EXCLUDED"
            : "UNKNOWN");
    }

    return {
      key: `AI_DETECTED_DOCUMENT:${document.id}`,
      amount: document.amount,
      currency: "ISK",
      state,
    };
  });

  return buildReconciliationCoverageSnapshot({
    mode: input.mode,
    cardinality: "ONE_TO_ONE",
    source,
    target,
  });
}

function bankSourceState(
  row: DiagnosticSnapshot["transactions"][number],
  mode: ReconciliationCoverageMode,
): ReconciliationCoverageItem["state"] {
  if (mode === "EXCLUDED") return "EXCLUDED";

  switch (row.overall.state) {
    case "CONFIRMED":
      return "CONFIRMED";
    case "SINGLE_TARGET_CANDIDATE": {
      const candidates = [...row.booking.candidates, ...row.events.candidates];
      return candidates.length === 1 && candidates[0].strength === "STRONG"
        ? "STRONG_UNCONFIRMED"
        : "UNRESOLVED";
    }
    case "MULTIPLE_TARGET_CANDIDATES":
      return "AMBIGUOUS";
    case "CANDIDATES_BLOCKED":
    case "UNRESOLVED":
      return "UNRESOLVED";
    case "UNSUPPORTED":
      return "UNKNOWN";
    case "DATA_CONFLICT":
    case "SOURCE_ERROR":
      return "UNKNOWN";
  }
}

type TargetAggregate = {
  key: string;
  state: ReconciliationCoverageItem["state"];
};

function targetStatePriority(state: ReconciliationCoverageItem["state"]) {
  switch (state) {
    case "CONFIRMED": return 5;
    case "AMBIGUOUS": return 4;
    case "STRONG_UNCONFIRMED": return 3;
    case "UNRESOLVED": return 2;
    case "UNKNOWN": return 1;
    case "EXCLUDED": return 0;
  }
}

/**
 * Bank diagnostics -> generic coverage adapter.
 *
 * Bank reconciliation can span bookings, FinancialEvents and other flows, so
 * this projection is intentionally MANY_TO_MANY. Target rows are the unique
 * counterpart records already discovered by the diagnostic graph; their
 * amounts are left unknown rather than guessed from the bank side.
 */
export function buildBankDiagnosticCoverageSnapshot(input: {
  mode: ReconciliationCoverageMode;
  diagnostic: DiagnosticSnapshot;
  classifications?: readonly {
    bankTransactionId: number;
    classification: FinancialSourceClassificationCode;
  }[];
}): ReconciliationCoverageSnapshot {
  const classificationByTransactionId = new Map(
    (input.classifications ?? []).map((item) => [item.bankTransactionId, item.classification]),
  );

  const source: ReconciliationCoverageItem[] = input.diagnostic.transactions.map((row) => {
    const classification = classificationByTransactionId.get(row.bank.bankTransactionId);
    return {
      key: `BANK_TRANSACTION:${row.bank.bankTransactionId}`,
      amount: row.bank.amount,
      currency: row.bank.currency,
      state: classificationExcludesBusinessCoverage(classification)
        ? "EXCLUDED"
        : bankSourceState(row, input.mode),
    };
  });

  const targets = new Map<string, TargetAggregate>();
  const setTarget = (key: string, state: ReconciliationCoverageItem["state"]) => {
    const actualState = input.mode === "EXCLUDED" ? "EXCLUDED" : state;
    const current = targets.get(key);
    if (!current || targetStatePriority(actualState) > targetStatePriority(current.state)) {
      targets.set(key, { key, state: actualState });
    }
  };

  for (const row of input.diagnostic.transactions) {
    const classification = classificationByTransactionId.get(row.bank.bankTransactionId);
    if (classificationExcludesBusinessCoverage(classification)) continue;

    for (const link of row.confirmed.links) {
      if (link.state !== "VALID") continue;
      setTarget(`${link.target.type}:${link.target.id}`, "CONFIRMED");
    }

    const candidates = [...row.booking.candidates, ...row.events.candidates];
    const sourceState = bankSourceState(row, input.mode);
    const candidateState: ReconciliationCoverageItem["state"] =
      sourceState === "AMBIGUOUS"
        ? "AMBIGUOUS"
        : sourceState === "STRONG_UNCONFIRMED"
          ? "STRONG_UNCONFIRMED"
          : "UNRESOLVED";
    for (const candidate of candidates) {
      setTarget(`${candidate.target.type}:${candidate.target.id}`, candidateState);
    }
  }

  const target: ReconciliationCoverageItem[] = [...targets.values()].map((item) => ({
    key: item.key,
    amount: null,
    currency: null,
    state: item.state,
  }));

  return buildReconciliationCoverageSnapshot({
    mode: input.mode,
    cardinality: "MANY_TO_MANY",
    source,
    target,
  });
}
