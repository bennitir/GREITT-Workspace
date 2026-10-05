import { normalizePartyText } from "./candidates";
import {
  evaluateReviewedDocumentPair,
  type ReviewedDocumentCandidateInput,
  type ReviewedDocumentEvidenceKind,
  type ReviewedDocumentIdentityEvidence,
} from "./reviewed-document-provider";
import type { ReviewedDocumentLearningPattern } from "./reviewed-document-learning";

export type ReviewedDocumentCardInput = {
  id: number;
  paymentCardId: number;
  date: Date;
  merchantText: string;
  amount: string | number;
  sourceRawData: string | null;
};

/**
 * Card reconciliation consumes the already separated AiDetectedDocument as the
 * canonical matching unit. Receipt is only the source container/navigation
 * anchor; parent Receipt facts must never leak into a sibling detected document.
 */
export type CardCanonicalDocumentFacts = {
  documentId: number;
  receiptId: number;
  reviewedAt: Date | null;
  date: Date | null;
  documentType: string | null;
  documentRole: string | null;
  totalAmount: string | number | null;
  merchantName: string | null;
  merchantKennitala: string | null;
  receiptNumber: string | null;
  pageNumber: number | null;
  documentFingerprint: string | null;
  classificationSource: string | null;
  duplicateMarkedAt: Date | null;
  disposedAt: Date | null;
  disposition: string | null;
  invoiceIdentifiers: readonly string[];
  partyAliases?: readonly string[];
  hasPrimaryFinancialEvent: boolean;
};

export type CardReviewedDocumentInput = ReviewedDocumentCandidateInput & {
  documentPageNumber: number | null;
  documentFingerprint: string | null;
  classificationSource: string | null;
};

/**
 * Materialize card-matching input strictly from one separated/classified
 * AiDetectedDocument. No Receipt.date / Receipt.aiDate / Receipt.merchantName
 * fallback is allowed here: that would let facts from one sibling document
 * contaminate another document inside the same uploaded PDF/container.
 */
export function materializeCardCanonicalDocument(
  document: CardCanonicalDocumentFacts,
): CardReviewedDocumentInput | null {
  if (!Number.isSafeInteger(document.documentId) || !Number.isSafeInteger(document.receiptId)) {
    return null;
  }
  if (!document.reviewedAt || !Number.isFinite(document.reviewedAt.getTime())) return null;
  if (document.totalAmount === null) return null;
  if (document.duplicateMarkedAt || document.disposedAt || document.disposition) return null;

  return {
    documentId: document.documentId,
    receiptId: document.receiptId,
    reviewedAt: document.reviewedAt,
    effectiveDate: document.date,
    documentType: document.documentType,
    documentRole: document.documentRole,
    totalAmount: document.totalAmount,
    merchantName: document.merchantName,
    merchantKennitala: document.merchantKennitala,
    receiptNumber: document.receiptNumber,
    invoiceIdentifiers: document.invoiceIdentifiers,
    partyAliases: document.partyAliases ?? [],
    hasPrimaryFinancialEvent: document.hasPrimaryFinancialEvent,
    documentPageNumber: document.pageNumber,
    documentFingerprint: document.documentFingerprint,
    classificationSource: document.classificationSource,
  };
}

export type CardReviewedDocumentCandidate = {
  paymentCardTransactionId: number;
  paymentCardId: number;
  cardDate: Date;
  merchantText: string;
  cardAmount: string;
  documentId: number;
  receiptId: number;
  documentDate: Date;
  documentType: string;
  documentRole: string | null;
  documentAmount: string;
  merchantName: string | null;
  receiptNumber: string | null;
  documentPageNumber: number | null;
  documentFingerprint: string | null;
  classificationSource: string | null;
  evidenceKind: ReviewedDocumentEvidenceKind;
  identityEvidence: ReviewedDocumentIdentityEvidence | "EXACT_AMOUNT_DATE";
  dateDistanceDays: number;
  strength: "STRONG" | "POSSIBLE";
  mutuallyUnique: boolean;
  providerCode:
    | "CARD_REVIEWED_DOCUMENT_EXACT_PARTY"
    | "CARD_REVIEWED_DOCUMENT_LEARNED_COMPANY_PATTERN"
    | "CARD_REVIEWED_DOCUMENT_EXACT_AMOUNT_DATE";
  learningConfirmationCount: number | null;
  source: "REVIEWED_DOCUMENT";
  writeState: "READ_ONLY";
};

export type CardReviewedDocumentCandidateResolution = {
  paymentCardTransactionId: number;
  state: "UNIQUE_STRONG" | "UNIQUE_POSSIBLE" | "AMBIGUOUS";
  candidates: CardReviewedDocumentCandidate[];
};


const DAY_MS = 86_400_000;

function toAbsoluteMinorUnits(value: string | number): bigint | null {
  if (
    typeof value === "number" &&
    (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100)
  ) return null;

  const raw = String(value).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return null;
  const fraction = match[3] ?? "";
  if (/[^0]/.test(fraction.slice(2))) return null;

  const units = BigInt(match[2]) * BigInt(100) +
    BigInt(fraction.slice(0, 2).padEnd(2, "0"));
  const signed = match[1] === "-" ? -units : units;
  return signed < BigInt(0) ? -signed : signed;
}

function utcDayKey(value: Date) {
  if (!Number.isFinite(value.getTime())) return null;
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Deterministic first-pass lookup key for card/document reconciliation.
 * Merchant text is deliberately absent: processors and receipts often use
 * different trading/legal/location names. Identity is evaluated only after
 * exact date + absolute amount has found the narrow search bucket.
 */
export function cardReviewedDocumentExactSearchKey(input: {
  date: Date;
  amount: string | number;
  currency?: string;
}) {
  const day = utcDayKey(input.date);
  const amount = toAbsoluteMinorUnits(input.amount);
  if (!day || amount === null || amount === BigInt(0)) return null;
  const currency = String(input.currency ?? "ISK").trim().toUpperCase() || "ISK";
  return `${currency}|${day}|${amount.toString()}`;
}

function matchingMerchantAlias(
  cardText: string,
  document: Pick<ReviewedDocumentCandidateInput, "merchantName" | "partyAliases">,
) {
  const card = normalizePartyText(cardText);
  if (card.length < 3) return null;

  const parties = [document.merchantName, ...(document.partyAliases ?? [])]
    .map((value) => ({ raw: value ?? "", normalized: normalizePartyText(value) }))
    .filter((value) => value.normalized.length >= 3);

  const match = parties.find(({ normalized }) =>
    card === normalized || card.includes(normalized) || normalized.includes(card),
  );
  return match?.raw || null;
}


function exactAmountDateFallbackCandidate(
  card: ReviewedDocumentCardInput,
  document: CardReviewedDocumentInput,
): Omit<CardReviewedDocumentCandidate, "strength" | "mutuallyUnique"> | null {
  const cardKey = cardReviewedDocumentExactSearchKey({ date: card.date, amount: card.amount });
  const documentKey = document.effectiveDate
    ? cardReviewedDocumentExactSearchKey({ date: document.effectiveDate, amount: document.totalAmount })
    : null;
  if (!cardKey || cardKey !== documentKey) return null;

  // Reuse the shared reviewed-document evaluator as the eligibility gate.
  // Supplying the document's own canonical party here is intentionally only a
  // probe: the returned card candidate is marked EXACT_AMOUNT_DATE, not as
  // identity-confirmed evidence. This keeps document type, reviewed-state,
  // FinancialEvent ownership, exact amount and date-window rules centralized.
  const probeParty = document.merchantName ?? document.partyAliases?.[0] ?? null;
  if (!probeParty) return null;
  const base = evaluateReviewedDocumentPair(
    {
      id: card.id,
      bankAccountId: card.paymentCardId,
      date: card.date,
      text: probeParty,
      amount: card.amount,
      reference: null,
      sourceRawData: null,
    },
    document,
    [],
  );
  if (!base || base.dateDistanceDays !== 0) return null;

  return {
    paymentCardTransactionId: card.id,
    paymentCardId: card.paymentCardId,
    cardDate: card.date,
    merchantText: card.merchantText,
    cardAmount: String(card.amount),
    documentId: base.documentId,
    receiptId: base.receiptId,
    documentDate: base.documentDate,
    documentType: base.documentType,
    documentRole: base.documentRole,
    documentAmount: base.documentAmount,
    merchantName: base.merchantName,
    receiptNumber: base.receiptNumber,
    documentPageNumber: document.documentPageNumber,
    documentFingerprint: document.documentFingerprint,
    classificationSource: document.classificationSource,
    evidenceKind: base.evidenceKind,
    identityEvidence: "EXACT_AMOUNT_DATE",
    dateDistanceDays: 0,
    providerCode: "CARD_REVIEWED_DOCUMENT_EXACT_AMOUNT_DATE",
    learningConfirmationCount: null,
    source: "REVIEWED_DOCUMENT",
    writeState: "READ_ONLY",
  };
}

/**
 * Card-specific adapter over the reviewed-document evidence rules.
 *
 * We deliberately reuse the same amount/date/document eligibility logic as the
 * bank reviewed-document bridge. The only extra rule is card merchant identity:
 * card processors commonly append terminal/location text, so normalized
 * containment is accepted as party evidence. It is still never enough on its
 * own: absolute amount equality, <=30 days and reviewed-document eligibility
 * remain mandatory.
 */
export function evaluateCardReviewedDocumentPair(
  card: ReviewedDocumentCardInput,
  document: CardReviewedDocumentInput,
  learningPatterns: readonly ReviewedDocumentLearningPattern[] = [],
): Omit<CardReviewedDocumentCandidate, "strength" | "mutuallyUnique"> | null {
  if (!Number.isSafeInteger(card.id) || !Number.isSafeInteger(card.paymentCardId)) return null;
  if (!Number.isFinite(card.date.getTime())) return null;

  let base = evaluateReviewedDocumentPair(
    {
      id: card.id,
      bankAccountId: card.paymentCardId,
      date: card.date,
      text: card.merchantText,
      amount: card.amount,
      reference: null,
      sourceRawData: card.sourceRawData,
    },
    document,
    learningPatterns,
  );

  // Visa/Mastercard merchant strings often contain a location/terminal suffix.
  // If the shared evaluator rejected only because exact party text was absent,
  // retry with the document's canonical merchant name after independently
  // proving normalized containment. All other shared safety checks still run.
  if (!base) {
    const merchantAlias = matchingMerchantAlias(card.merchantText, document);
    if (merchantAlias) {
      base = evaluateReviewedDocumentPair(
        {
          id: card.id,
          bankAccountId: card.paymentCardId,
          date: card.date,
          text: merchantAlias,
          amount: card.amount,
          reference: null,
          sourceRawData: null,
        },
        document,
        learningPatterns,
      );
    }
  }

  if (!base) return null;
  if (
    base.identityEvidence !== "EXACT_PARTY" &&
    base.identityEvidence !== "LEARNED_COMPANY_PATTERN"
  ) {
    // Card statements do not provide a canonical invoice reference/kennitala
    // contract in the current importer. Do not accidentally treat incidental
    // raw spreadsheet fields as stronger evidence than the merchant identity.
    return null;
  }

  return {
    paymentCardTransactionId: card.id,
    paymentCardId: card.paymentCardId,
    cardDate: card.date,
    merchantText: card.merchantText,
    cardAmount: String(card.amount),
    documentId: base.documentId,
    receiptId: base.receiptId,
    documentDate: base.documentDate,
    documentType: base.documentType,
    documentRole: base.documentRole,
    documentAmount: base.documentAmount,
    merchantName: base.merchantName,
    receiptNumber: base.receiptNumber,
    documentPageNumber: document.documentPageNumber,
    documentFingerprint: document.documentFingerprint,
    classificationSource: document.classificationSource,
    evidenceKind: base.evidenceKind,
    identityEvidence: base.identityEvidence,
    dateDistanceDays: base.dateDistanceDays,
    providerCode:
      base.identityEvidence === "LEARNED_COMPANY_PATTERN"
        ? "CARD_REVIEWED_DOCUMENT_LEARNED_COMPANY_PATTERN"
        : "CARD_REVIEWED_DOCUMENT_EXACT_PARTY",
    learningConfirmationCount: base.learningConfirmationCount,
    source: "REVIEWED_DOCUMENT",
    writeState: "READ_ONLY",
  };
}

export function buildCardReviewedDocumentCandidateGraph(
  cards: readonly ReviewedDocumentCardInput[],
  documents: readonly CardReviewedDocumentInput[],
  learningPatterns: readonly ReviewedDocumentLearningPattern[] = [],
): CardReviewedDocumentCandidateResolution[] {
  // Exact purchase date + absolute amount is the cheapest and most stable
  // lookup available in card statements. Build that index before any merchant
  // comparison. This mirrors the useful bank-reconciliation behaviour where
  // exact date/amount can be surfaced as POSSIBLE even when party identity is
  // not yet canonicalized.
  const exactDocumentsByKey = new Map<string, CardReviewedDocumentInput[]>();
  for (const document of documents) {
    if (!document.effectiveDate) continue;
    const key = cardReviewedDocumentExactSearchKey({
      date: document.effectiveDate,
      amount: document.totalAmount,
    });
    if (!key) continue;
    exactDocumentsByKey.set(key, [...(exactDocumentsByKey.get(key) ?? []), document]);
  }

  const raw = cards.flatMap((card) => {
    const exactKey = cardReviewedDocumentExactSearchKey({ date: card.date, amount: card.amount });
    const exactDocuments = exactKey ? exactDocumentsByKey.get(exactKey) ?? [] : [];
    const exactCandidates = exactDocuments.flatMap((document) => {
      const identityCandidate = evaluateCardReviewedDocumentPair(card, document, learningPatterns);
      if (identityCandidate) return [identityCandidate];
      const amountDateCandidate = exactAmountDateFallbackCandidate(card, document);
      return amountDateCandidate ? [amountDateCandidate] : [];
    });

    // Exact amount/date dominates the wider recovery search even when merchant
    // identity still needs human confirmation. This prevents a nearby repeated
    // charge from obscuring the obvious same-day document. Multiple exact rows
    // remain fail-closed and ambiguous.
    if (exactCandidates.length > 0) return exactCandidates;

    return documents.flatMap((document) => {
      const candidate = evaluateCardReviewedDocumentPair(card, document, learningPatterns);
      return candidate ? [candidate] : [];
    });
  });

  // Card statements and reviewed receipts normally share the purchase date. A
  // wider <=30 day window is useful as a recovery/search window, but it must
  // never be allowed to make an exact-date edge ambiguous merely because the
  // same merchant charged the same amount again later in the month.
  //
  // Apply exact-date dominance on both sides of the graph before uniqueness is
  // calculated:
  //   1. if a card transaction has one or more exact-date candidates, discard
  //      its non-exact candidates from the resolution graph;
  //   2. if a reviewed document has one or more exact-date card candidates,
  //      discard non-exact card edges to that document.
  // Multiple exact-date candidates are intentionally retained and therefore
  // remain fail-closed/ambiguous.
  const cardsWithExactDate = new Set(
    raw
      .filter((candidate) => candidate.dateDistanceDays === 0)
      .map((candidate) => candidate.paymentCardTransactionId),
  );
  const documentsWithExactDate = new Set(
    raw
      .filter((candidate) => candidate.dateDistanceDays === 0)
      .map((candidate) => candidate.documentId),
  );

  const dateDominant = raw.filter((candidate) => {
    if (
      cardsWithExactDate.has(candidate.paymentCardTransactionId) &&
      candidate.dateDistanceDays !== 0
    ) {
      return false;
    }
    if (
      documentsWithExactDate.has(candidate.documentId) &&
      candidate.dateDistanceDays !== 0
    ) {
      return false;
    }
    return true;
  });

  const countByCard = new Map<number, number>();
  const countByDocument = new Map<number, number>();
  for (const candidate of dateDominant) {
    countByCard.set(
      candidate.paymentCardTransactionId,
      (countByCard.get(candidate.paymentCardTransactionId) ?? 0) + 1,
    );
    countByDocument.set(
      candidate.documentId,
      (countByDocument.get(candidate.documentId) ?? 0) + 1,
    );
  }

  const resolved: CardReviewedDocumentCandidate[] = dateDominant.map((candidate) => {
    const mutuallyUnique =
      countByCard.get(candidate.paymentCardTransactionId) === 1 &&
      countByDocument.get(candidate.documentId) === 1;
    const learnedStrong =
      candidate.identityEvidence === "LEARNED_COMPANY_PATTERN" &&
      (candidate.learningConfirmationCount ?? 0) >= 3 &&
      candidate.dateDistanceDays <= 3;
    const exactMerchantNearDate =
      candidate.identityEvidence === "EXACT_PARTY" &&
      candidate.dateDistanceDays <= 3;
    const strength = mutuallyUnique && (exactMerchantNearDate || learnedStrong)
      ? "STRONG" as const
      : "POSSIBLE" as const;
    return { ...candidate, mutuallyUnique, strength };
  });

  return cards.flatMap((card) => {
    const candidates = resolved
      .filter((candidate) => candidate.paymentCardTransactionId === card.id)
      .sort((left, right) =>
        Number(right.strength === "STRONG") - Number(left.strength === "STRONG") ||
        left.dateDistanceDays - right.dateDistanceDays ||
        left.documentId - right.documentId,
      );
    if (!candidates.length) return [];

    const state: CardReviewedDocumentCandidateResolution["state"] =
      candidates.length > 1
        ? "AMBIGUOUS"
        : candidates[0].strength === "STRONG"
          ? "UNIQUE_STRONG"
          : "UNIQUE_POSSIBLE";

    return [{ paymentCardTransactionId: card.id, state, candidates }];
  });
}
