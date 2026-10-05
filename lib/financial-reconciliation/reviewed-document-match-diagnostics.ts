import { normalizePartyText } from "./candidates";
import {
  evidenceKindForReviewedDocumentType,
  type ReviewedDocumentCandidateInput,
} from "./reviewed-document-provider";

export type ReviewedDocumentDiagnosticDocument = ReviewedDocumentCandidateInput & {
  blockedByConfirmedReconciliation?: boolean;
};

export type ReviewedDocumentDiagnosticSource = {
  sourceId: number;
  date: Date;
  amount: string | number;
  partyText: string;
};

export type ReviewedDocumentDiagnosticResolution = {
  sourceId: number;
  state: "UNIQUE_STRONG" | "UNIQUE_POSSIBLE" | "AMBIGUOUS";
  candidateDocumentIds: readonly number[];
};

export type ReviewedDocumentDiagnosticReason =
  | "CANDIDATE_FOUND"
  | "AMBIGUOUS"
  | "NO_AMOUNT_MATCH"
  | "DATE_OUTSIDE_WINDOW"
  | "DOCUMENT_INELIGIBLE"
  | "IDENTITY_NOT_RESOLVED";

export type ReviewedDocumentDiagnosticExample = {
  documentId: number;
  receiptId: number;
  merchantName: string | null;
  effectiveDate: Date | null;
  totalAmount: string;
  documentType: string | null;
  hasPrimaryFinancialEvent: boolean;
  partyAliasMatch: boolean;
  dateDistanceDays: number | null;
};

export type ReviewedDocumentSourceDiagnostic = {
  sourceId: number;
  sourceDate: Date;
  sourceAmount: string;
  sourcePartyText: string;
  reason: ReviewedDocumentDiagnosticReason;
  amountMatchCount: number;
  nearDateCount: number;
  exactDateCount: number;
  eligibleNearDateCount: number;
  partyCompatibleCount: number;
  primaryEventCount: number;
  confirmedOwnershipCount: number;
  unsupportedDocumentTypeCount: number;
  missingCanonicalDateCount: number;
  candidateCount: number;
  examples: ReviewedDocumentDiagnosticExample[];
};

export type ReviewedDocumentDiagnosticSummary = {
  sourceCount: number;
  candidateFound: number;
  ambiguous: number;
  noAmountMatch: number;
  dateOutsideWindow: number;
  documentIneligible: number;
  identityNotResolved: number;
  diagnostics: ReviewedDocumentSourceDiagnostic[];
};

const DAY_MS = 86_400_000;

function dayOrdinal(value: Date) {
  return Math.floor(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
  ) / DAY_MS);
}

function dateDistanceDays(left: Date, right: Date) {
  return Math.abs(dayOrdinal(left) - dayOrdinal(right));
}

function toMinorUnits(value: string | number): bigint | null {
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const raw = String(value).trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) return null;
  const fraction = match[3] ?? "";
  if (/[^0]/.test(fraction.slice(2))) return null;
  const units = BigInt(match[2]) * BigInt(100) + BigInt(fraction.slice(0, 2).padEnd(2, "0"));
  return match[1] === "-" ? -units : units;
}

function absolute(value: bigint) {
  return value < BigInt(0) ? -value : value;
}

function absoluteAmountsEqual(left: string | number, right: string | number) {
  const a = toMinorUnits(left);
  const b = toMinorUnits(right);
  return a !== null && b !== null && a !== BigInt(0) && b !== BigInt(0) && absolute(a) === absolute(b);
}

function partyCompatible(
  sourceText: string,
  document: ReviewedDocumentDiagnosticDocument,
  mode: "EXACT" | "CONTAINMENT",
) {
  const source = normalizePartyText(sourceText);
  if (source.length < 3) return false;
  const parties = [document.merchantName, ...(document.partyAliases ?? [])]
    .map((value) => normalizePartyText(value))
    .filter((value) => value.length >= 3);
  return parties.some((party) => mode === "EXACT"
    ? source === party
    : source === party || source.includes(party) || party.includes(source));
}

function exampleFor(
  source: ReviewedDocumentDiagnosticSource,
  document: ReviewedDocumentDiagnosticDocument,
  mode: "EXACT" | "CONTAINMENT",
): ReviewedDocumentDiagnosticExample {
  return {
    documentId: document.documentId,
    receiptId: document.receiptId,
    merchantName: document.merchantName,
    effectiveDate: document.effectiveDate,
    totalAmount: String(document.totalAmount),
    documentType: document.documentType,
    hasPrimaryFinancialEvent: document.hasPrimaryFinancialEvent,
    partyAliasMatch: partyCompatible(source.partyText, document, mode),
    dateDistanceDays: document.effectiveDate ? dateDistanceDays(source.date, document.effectiveDate) : null,
  };
}

/**
 * Shared read-only explanation layer for reviewed-document matching. It does
 * not create candidates and does not loosen fail-closed rules. It explains the
 * strongest deterministic reason why a source row did not become a candidate.
 */
export function buildReviewedDocumentMatchDiagnostics(input: {
  sources: readonly ReviewedDocumentDiagnosticSource[];
  documents: readonly ReviewedDocumentDiagnosticDocument[];
  resolutions: readonly ReviewedDocumentDiagnosticResolution[];
  partyMode: "EXACT" | "CONTAINMENT";
  exampleLimit?: number;
}): ReviewedDocumentDiagnosticSummary {
  const resolutionBySource = new Map(input.resolutions.map((resolution) => [resolution.sourceId, resolution]));
  const exampleLimit = Math.max(1, Math.min(5, input.exampleLimit ?? 3));

  const diagnostics = input.sources.map((source): ReviewedDocumentSourceDiagnostic => {
    const resolution = resolutionBySource.get(source.sourceId);
    const amountMatches = input.documents.filter((document) =>
      absoluteAmountsEqual(source.amount, document.totalAmount));
    const nearDate = amountMatches.filter((document) =>
      document.effectiveDate && dateDistanceDays(source.date, document.effectiveDate) <= 30);
    const exactDate = nearDate.filter((document) =>
      document.effectiveDate && dateDistanceDays(source.date, document.effectiveDate) === 0);
    const eligibleNearDate = nearDate.filter((document) =>
      Boolean(evidenceKindForReviewedDocumentType(document.documentType)) &&
      !document.hasPrimaryFinancialEvent &&
      !document.blockedByConfirmedReconciliation &&
      Boolean(document.effectiveDate));
    const partyMatches = eligibleNearDate.filter((document) =>
      partyCompatible(source.partyText, document, input.partyMode));

    const reason: ReviewedDocumentDiagnosticReason = resolution
      ? resolution.state === "AMBIGUOUS" ? "AMBIGUOUS" : "CANDIDATE_FOUND"
      : amountMatches.length === 0
        ? "NO_AMOUNT_MATCH"
        : nearDate.length === 0
          ? "DATE_OUTSIDE_WINDOW"
          : eligibleNearDate.length === 0
            ? "DOCUMENT_INELIGIBLE"
            : "IDENTITY_NOT_RESOLVED";

    const examplePool = reason === "IDENTITY_NOT_RESOLVED"
      ? eligibleNearDate
      : reason === "DOCUMENT_INELIGIBLE"
        ? nearDate
        : reason === "DATE_OUTSIDE_WINDOW"
          ? amountMatches
          : nearDate;

    return {
      sourceId: source.sourceId,
      sourceDate: source.date,
      sourceAmount: String(source.amount),
      sourcePartyText: source.partyText,
      reason,
      amountMatchCount: amountMatches.length,
      nearDateCount: nearDate.length,
      exactDateCount: exactDate.length,
      eligibleNearDateCount: eligibleNearDate.length,
      partyCompatibleCount: partyMatches.length,
      primaryEventCount: nearDate.filter((document) => document.hasPrimaryFinancialEvent).length,
      confirmedOwnershipCount: nearDate.filter((document) => document.blockedByConfirmedReconciliation).length,
      unsupportedDocumentTypeCount: nearDate.filter((document) =>
        !evidenceKindForReviewedDocumentType(document.documentType)).length,
      missingCanonicalDateCount: amountMatches.filter((document) => !document.effectiveDate).length,
      candidateCount: resolution?.candidateDocumentIds.length ?? 0,
      examples: examplePool
        .slice()
        .sort((left, right) => {
          const leftDistance = left.effectiveDate ? dateDistanceDays(source.date, left.effectiveDate) : Number.MAX_SAFE_INTEGER;
          const rightDistance = right.effectiveDate ? dateDistanceDays(source.date, right.effectiveDate) : Number.MAX_SAFE_INTEGER;
          return leftDistance - rightDistance || left.documentId - right.documentId;
        })
        .slice(0, exampleLimit)
        .map((document) => exampleFor(source, document, input.partyMode)),
    };
  });

  const count = (reason: ReviewedDocumentDiagnosticReason) =>
    diagnostics.filter((item) => item.reason === reason).length;

  return {
    sourceCount: diagnostics.length,
    candidateFound: count("CANDIDATE_FOUND"),
    ambiguous: count("AMBIGUOUS"),
    noAmountMatch: count("NO_AMOUNT_MATCH"),
    dateOutsideWindow: count("DATE_OUTSIDE_WINDOW"),
    documentIneligible: count("DOCUMENT_INELIGIBLE"),
    identityNotResolved: count("IDENTITY_NOT_RESOLVED"),
    diagnostics,
  };
}
