import { normalizePartyText } from "./candidates";

export const REVIEWED_DOCUMENT_LEARNING_VERSION =
  "reviewed-document-learning-v1" as const;

export type ReviewedDocumentLearningDirection = "INFLOW" | "OUTFLOW";

const UNLEARNABLE_BANK_PARTY_KEYS = new Set([
  "kreditkort",
  "millifaersla",
  "bakfaersla",
  "thjonustugjald",
  "bankagjald",
  "utvextir",
  "innvextir",
]);

export type ReviewedDocumentLearningObservation = {
  version: typeof REVIEWED_DOCUMENT_LEARNING_VERSION;
  bankPartyKey: string;
  documentPartyKey: string;
  documentType: string;
  bankDirection: ReviewedDocumentLearningDirection;
  amountRelation: "ABS_EQUAL";
  dateDistanceDays: number;
};

export type ReviewedDocumentLearningPattern = {
  bankPartyKey: string;
  documentPartyKey: string;
  documentType: string;
  bankDirection: ReviewedDocumentLearningDirection;
  confirmationCount: number;
  minDateDistanceDays: number;
  maxDateDistanceDays: number;
};

function parseRawBankData(sourceRawData: string | null) {
  if (!sourceRawData) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(sourceRawData);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

export function reviewedDocumentBankPartyKey(input: {
  text: string;
  sourceRawData: string | null;
}) {
  const raw = parseRawBankData(input.sourceRawData);
  const counterparty = normalizePartyText(
    typeof raw.counterparty === "string" ? raw.counterparty : "",
  );
  return counterparty || normalizePartyText(input.text);
}

export function reviewedDocumentDirection(
  amount: string | number,
): ReviewedDocumentLearningDirection | null {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric === 0) return null;
  return numeric > 0 ? "INFLOW" : "OUTFLOW";
}

export function buildReviewedDocumentLearningObservation(input: {
  bankText: string;
  bankSourceRawData: string | null;
  bankAmount: string | number;
  documentMerchantName: string | null;
  documentType: string | null;
  dateDistanceDays: number;
}): ReviewedDocumentLearningObservation | null {
  const bankPartyKey = reviewedDocumentBankPartyKey({
    text: input.bankText,
    sourceRawData: input.bankSourceRawData,
  });
  const documentPartyKey = normalizePartyText(input.documentMerchantName);
  const documentType = String(input.documentType ?? "").trim().toUpperCase();
  const bankDirection = reviewedDocumentDirection(input.bankAmount);

  if (
    bankPartyKey.length < 3 ||
    UNLEARNABLE_BANK_PARTY_KEYS.has(bankPartyKey) ||
    documentPartyKey.length < 3 ||
    !documentType ||
    !bankDirection ||
    !Number.isInteger(input.dateDistanceDays) ||
    input.dateDistanceDays < 0 ||
    input.dateDistanceDays > 365
  ) return null;

  return {
    version: REVIEWED_DOCUMENT_LEARNING_VERSION,
    bankPartyKey,
    documentPartyKey,
    documentType,
    bankDirection,
    amountRelation: "ABS_EQUAL",
    dateDistanceDays: input.dateDistanceDays,
  };
}

function isObservation(value: unknown): value is ReviewedDocumentLearningObservation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    item.version === REVIEWED_DOCUMENT_LEARNING_VERSION &&
    typeof item.bankPartyKey === "string" && item.bankPartyKey.length >= 3 &&
    typeof item.documentPartyKey === "string" && item.documentPartyKey.length >= 3 &&
    typeof item.documentType === "string" && item.documentType.length > 0 &&
    (item.bankDirection === "INFLOW" || item.bankDirection === "OUTFLOW") &&
    item.amountRelation === "ABS_EQUAL" &&
    typeof item.dateDistanceDays === "number" && Number.isInteger(item.dateDistanceDays) &&
    item.dateDistanceDays >= 0 && item.dateDistanceDays <= 365
  );
}

export function readReviewedDocumentLearningObservation(
  metadata: unknown,
): ReviewedDocumentLearningObservation | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const learning = (metadata as Record<string, unknown>).learning;
  return isObservation(learning) ? learning : null;
}

export function buildReviewedDocumentLearningPatterns(
  metadataValues: readonly unknown[],
): ReviewedDocumentLearningPattern[] {
  const groups = new Map<string, ReviewedDocumentLearningPattern>();

  for (const metadata of metadataValues) {
    const observation = readReviewedDocumentLearningObservation(metadata);
    if (!observation) continue;
    const key = [
      observation.bankPartyKey,
      observation.documentPartyKey,
      observation.documentType,
      observation.bankDirection,
    ].join("\u001f");
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        bankPartyKey: observation.bankPartyKey,
        documentPartyKey: observation.documentPartyKey,
        documentType: observation.documentType,
        bankDirection: observation.bankDirection,
        confirmationCount: 1,
        minDateDistanceDays: observation.dateDistanceDays,
        maxDateDistanceDays: observation.dateDistanceDays,
      });
      continue;
    }
    existing.confirmationCount += 1;
    existing.minDateDistanceDays = Math.min(
      existing.minDateDistanceDays,
      observation.dateDistanceDays,
    );
    existing.maxDateDistanceDays = Math.max(
      existing.maxDateDistanceDays,
      observation.dateDistanceDays,
    );
  }

  return [...groups.values()].sort((left, right) =>
    right.confirmationCount - left.confirmationCount ||
    left.bankPartyKey.localeCompare(right.bankPartyKey),
  );
}

export function matchReviewedDocumentLearningPattern(input: {
  bankText: string;
  bankSourceRawData: string | null;
  bankAmount: string | number;
  documentMerchantName: string | null;
  documentType: string | null;
  dateDistanceDays: number;
  patterns: readonly ReviewedDocumentLearningPattern[];
}): ReviewedDocumentLearningPattern | null {
  const bankPartyKey = reviewedDocumentBankPartyKey({
    text: input.bankText,
    sourceRawData: input.bankSourceRawData,
  });
  const documentPartyKey = normalizePartyText(input.documentMerchantName);
  const documentType = String(input.documentType ?? "").trim().toUpperCase();
  const direction = reviewedDocumentDirection(input.bankAmount);
  if (!bankPartyKey || !documentPartyKey || !documentType || !direction) return null;

  return input.patterns.find((pattern) => {
    if (pattern.confirmationCount < 2) return false;
    if (
      pattern.bankPartyKey !== bankPartyKey ||
      pattern.documentPartyKey !== documentPartyKey ||
      pattern.documentType !== documentType ||
      pattern.bankDirection !== direction
    ) return false;

    // Repeated human confirmations teach a bounded date envelope. We allow a
    // small deterministic tolerance around observed history, never beyond the
    // existing 30-day reviewed-document safety window.
    const min = Math.max(0, pattern.minDateDistanceDays - 3);
    const max = Math.min(30, pattern.maxDateDistanceDays + 3);
    return input.dateDistanceDays >= min && input.dateDistanceDays <= max;
  }) ?? null;
}
