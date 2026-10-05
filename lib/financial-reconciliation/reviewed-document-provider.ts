import { normalizePartyText } from "./candidates";
import {
  matchReviewedDocumentLearningPattern,
  type ReviewedDocumentLearningPattern,
} from "./reviewed-document-learning";

export const REVIEWED_DOCUMENT_EVIDENCE_KINDS = [
  "ACCOUNTING_DOCUMENT_EVIDENCE",
  "PAYMENT_NOTICE_EVIDENCE",
  "PAYMENT_CONFIRMATION_EVIDENCE",
] as const;

export type ReviewedDocumentEvidenceKind =
  (typeof REVIEWED_DOCUMENT_EVIDENCE_KINDS)[number];

export type ReviewedDocumentIdentityEvidence =
  | "EXACT_REFERENCE"
  | "EXACT_COUNTERPARTY_KENNITALA"
  | "EXACT_PARTY"
  | "LEARNED_COMPANY_PATTERN";

export type ReviewedDocumentBankInput = {
  id: number;
  bankAccountId: number;
  date: Date;
  text: string;
  amount: string | number;
  reference: string | null;
  sourceRawData: string | null;
};

export type ReviewedDocumentCandidateInput = {
  documentId: number;
  receiptId: number;
  reviewedAt: Date;
  effectiveDate: Date | null;
  documentType: string | null;
  documentRole: string | null;
  totalAmount: string | number;
  merchantName: string | null;
  merchantKennitala: string | null;
  receiptNumber: string | null;
  invoiceIdentifiers: readonly string[];
  /** Company-local canonical party/trading-name aliases derived from the same
   * reviewed document/entity graph. No global merchant guessing. */
  partyAliases?: readonly string[];
  hasPrimaryFinancialEvent: boolean;
};

export type ReviewedDocumentCandidate = {
  bankTransactionId: number;
  bankAccountId: number;
  bankDate: Date;
  bankText: string;
  bankAmount: string;
  bankReference: string | null;
  documentId: number;
  receiptId: number;
  documentDate: Date;
  documentType: string;
  documentRole: string | null;
  documentAmount: string;
  merchantName: string | null;
  receiptNumber: string | null;
  evidenceKind: ReviewedDocumentEvidenceKind;
  identityEvidence: ReviewedDocumentIdentityEvidence;
  dateDistanceDays: number;
  strength: "STRONG" | "POSSIBLE";
  mutuallyUnique: boolean;
  providerCode:
    | "REVIEWED_DOCUMENT_EXACT_REFERENCE"
    | "REVIEWED_DOCUMENT_EXACT_KENNITALA"
    | "REVIEWED_DOCUMENT_EXACT_PARTY"
    | "REVIEWED_DOCUMENT_LEARNED_COMPANY_PATTERN";
  learningConfirmationCount: number | null;
  source: "REVIEWED_DOCUMENT";
  writeState: "READ_ONLY";
};

export type ReviewedDocumentCandidateResolution = {
  bankTransactionId: number;
  state: "UNIQUE_STRONG" | "UNIQUE_POSSIBLE" | "AMBIGUOUS";
  candidates: ReviewedDocumentCandidate[];
};

const DAY_MS = 86_400_000;

function toMinorUnits(value: string | number): bigint | null {
  if (
    typeof value === "number" &&
    (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100)
  ) {
    return null;
  }

  const raw = String(value).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return null;

  const fraction = match[3] ?? "";
  if (/[^0]/.test(fraction.slice(2))) return null;

  const units = BigInt(match[2]) * BigInt(100) +
    BigInt(fraction.slice(0, 2).padEnd(2, "0"));
  return match[1] === "-" ? -units : units;
}

function absolute(value: bigint) {
  return value < BigInt(0) ? -value : value;
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

function normalizedReference(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizedKennitala(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : "";
}

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

export function evidenceKindForReviewedDocumentType(
  documentType: string | null,
): ReviewedDocumentEvidenceKind | null {
  switch ((documentType ?? "").trim().toUpperCase()) {
    case "ACCOUNTING_DOCUMENT":
      return "ACCOUNTING_DOCUMENT_EVIDENCE";
    case "PAYMENT_NOTICE":
      return "PAYMENT_NOTICE_EVIDENCE";
    case "PAYMENT_CONFIRMATION":
      return "PAYMENT_CONFIRMATION_EVIDENCE";
    default:
      return null;
  }
}

function exactReferenceEvidence(
  bank: ReviewedDocumentBankInput,
  document: ReviewedDocumentCandidateInput,
) {
  const raw = parseRawBankData(bank.sourceRawData);
  const bankReferences = [bank.reference, raw.reference]
    .map((value) => normalizedReference(
      typeof value === "string" ? value : value == null ? null : String(value),
    ))
    .filter(Boolean);
  if (!bankReferences.length) return false;

  const documentReferences = [
    document.receiptNumber,
    ...document.invoiceIdentifiers,
  ].map(normalizedReference).filter(Boolean);

  return bankReferences.some((reference) => documentReferences.includes(reference));
}

function exactKennitalaEvidence(
  bank: ReviewedDocumentBankInput,
  document: ReviewedDocumentCandidateInput,
) {
  const raw = parseRawBankData(bank.sourceRawData);
  const bankKennitala = normalizedKennitala(
    typeof raw.counterpartyKennitala === "string"
      ? raw.counterpartyKennitala
      : String(raw.counterpartyKennitala ?? ""),
  );
  const documentKennitala = normalizedKennitala(document.merchantKennitala);
  return Boolean(bankKennitala && documentKennitala && bankKennitala === documentKennitala);
}

function exactPartyEvidence(
  bank: ReviewedDocumentBankInput,
  document: ReviewedDocumentCandidateInput,
) {
  const documentParties = [document.merchantName, ...(document.partyAliases ?? [])]
    .map((value) => normalizePartyText(value))
    .filter((value) => value.length >= 3);
  if (!documentParties.length) return false;

  const raw = parseRawBankData(bank.sourceRawData);
  const candidates = [raw.counterparty, bank.text]
    .map((value) => normalizePartyText(
      typeof value === "string" ? value : String(value ?? ""),
    ))
    .filter((value) => value.length >= 3);

  return candidates.some((value) => documentParties.includes(value));
}

export function evaluateReviewedDocumentPair(
  bank: ReviewedDocumentBankInput,
  document: ReviewedDocumentCandidateInput,
  learningPatterns: readonly ReviewedDocumentLearningPattern[] = [],
): Omit<ReviewedDocumentCandidate, "strength" | "mutuallyUnique"> | null {
  if (!Number.isSafeInteger(bank.id) || !Number.isSafeInteger(bank.bankAccountId)) return null;
  if (!Number.isSafeInteger(document.documentId) || !Number.isSafeInteger(document.receiptId)) return null;
  if (!Number.isFinite(bank.date.getTime())) return null;
  if (!Number.isFinite(document.reviewedAt.getTime())) return null;
  if (!document.effectiveDate || !Number.isFinite(document.effectiveDate.getTime())) return null;
  if (document.hasPrimaryFinancialEvent) return null;

  const evidenceKind = evidenceKindForReviewedDocumentType(document.documentType);
  if (!evidenceKind) return null;

  const bankMinor = toMinorUnits(bank.amount);
  const documentMinor = toMinorUnits(document.totalAmount);
  if (bankMinor === null || documentMinor === null) return null;
  if (bankMinor === BigInt(0) || documentMinor === BigInt(0)) return null;
  if (absolute(bankMinor) !== absolute(documentMinor)) return null;

  const dateDistanceDays = daysBetween(bank.date, document.effectiveDate);
  if (dateDistanceDays > 30) return null;

  let identityEvidence: ReviewedDocumentIdentityEvidence | null = null;
  let providerCode: ReviewedDocumentCandidate["providerCode"] | null = null;
  let learningConfirmationCount: number | null = null;

  if (exactReferenceEvidence(bank, document)) {
    identityEvidence = "EXACT_REFERENCE";
    providerCode = "REVIEWED_DOCUMENT_EXACT_REFERENCE";
  } else if (exactKennitalaEvidence(bank, document)) {
    identityEvidence = "EXACT_COUNTERPARTY_KENNITALA";
    providerCode = "REVIEWED_DOCUMENT_EXACT_KENNITALA";
  } else if (exactPartyEvidence(bank, document)) {
    identityEvidence = "EXACT_PARTY";
    providerCode = "REVIEWED_DOCUMENT_EXACT_PARTY";
  } else {
    const learnedPattern = matchReviewedDocumentLearningPattern({
      bankText: bank.text,
      bankSourceRawData: bank.sourceRawData,
      bankAmount: bank.amount,
      documentMerchantName: document.merchantName,
      documentType: document.documentType,
      dateDistanceDays,
      patterns: learningPatterns,
    });
    if (learnedPattern) {
      identityEvidence = "LEARNED_COMPANY_PATTERN";
      providerCode = "REVIEWED_DOCUMENT_LEARNED_COMPANY_PATTERN";
      learningConfirmationCount = learnedPattern.confirmationCount;
    }
  }

  if (!identityEvidence || !providerCode) return null;

  return {
    bankTransactionId: bank.id,
    bankAccountId: bank.bankAccountId,
    bankDate: bank.date,
    bankText: bank.text,
    bankAmount: String(bank.amount),
    bankReference: bank.reference,
    documentId: document.documentId,
    receiptId: document.receiptId,
    documentDate: document.effectiveDate,
    documentType: (document.documentType ?? "").trim().toUpperCase(),
    documentRole: document.documentRole,
    documentAmount: String(document.totalAmount),
    merchantName: document.merchantName,
    receiptNumber: document.receiptNumber,
    evidenceKind,
    identityEvidence,
    dateDistanceDays,
    providerCode,
    learningConfirmationCount,
    source: "REVIEWED_DOCUMENT",
    writeState: "READ_ONLY",
  };
}

export function buildReviewedDocumentCandidateGraph(
  banks: readonly ReviewedDocumentBankInput[],
  documents: readonly ReviewedDocumentCandidateInput[],
  learningPatterns: readonly ReviewedDocumentLearningPattern[] = [],
): ReviewedDocumentCandidateResolution[] {
  const raw = banks.flatMap((bank) => documents.flatMap((document) => {
    const candidate = evaluateReviewedDocumentPair(bank, document, learningPatterns);
    return candidate ? [candidate] : [];
  }));

  const countByBank = new Map<number, number>();
  const countByDocument = new Map<number, number>();
  for (const candidate of raw) {
    countByBank.set(
      candidate.bankTransactionId,
      (countByBank.get(candidate.bankTransactionId) ?? 0) + 1,
    );
    countByDocument.set(
      candidate.documentId,
      (countByDocument.get(candidate.documentId) ?? 0) + 1,
    );
  }

  const resolved: ReviewedDocumentCandidate[] = raw.map((candidate) => {
    const mutuallyUnique =
      countByBank.get(candidate.bankTransactionId) === 1 &&
      countByDocument.get(candidate.documentId) === 1;
    const learnedStrong =
      candidate.identityEvidence === "LEARNED_COMPANY_PATTERN" &&
      (candidate.learningConfirmationCount ?? 0) >= 3;
    const strength =
      mutuallyUnique && (
        candidate.identityEvidence === "EXACT_REFERENCE" ||
        candidate.identityEvidence === "EXACT_COUNTERPARTY_KENNITALA" ||
        learnedStrong
      )
        ? "STRONG" as const
        : "POSSIBLE" as const;
    return { ...candidate, mutuallyUnique, strength };
  });

  return banks.flatMap((bank) => {
    const candidates = resolved
      .filter((candidate) => candidate.bankTransactionId === bank.id)
      .sort((left, right) =>
        Number(right.strength === "STRONG") - Number(left.strength === "STRONG") ||
        left.dateDistanceDays - right.dateDistanceDays ||
        left.documentId - right.documentId,
      );
    if (!candidates.length) return [];

    const state: ReviewedDocumentCandidateResolution["state"] =
      candidates.length > 1
        ? "AMBIGUOUS"
        : candidates[0].strength === "STRONG"
          ? "UNIQUE_STRONG"
          : "UNIQUE_POSSIBLE";

    return [{ bankTransactionId: bank.id, state, candidates }];
  });
}
