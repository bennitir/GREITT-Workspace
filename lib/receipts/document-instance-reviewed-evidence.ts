import { createHash } from "node:crypto";

export type ReviewedInstallmentEvidence = {
  fieldLabel: string;
  sequenceText: string;
  totalText: string;
  verbatimText: string;
};

export function normalizeReviewedCanonicalText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function reviewedCanonicalTextDigest(value: string) {
  return createHash("sha256")
    .update(normalizeReviewedCanonicalText(value))
    .digest("hex");
}

function normalizeReference(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g, "")
    : "";
}

function normalizeLabel(value: unknown) {
  return typeof value === "string"
    ? value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("is-IS")
        .replace(/[.:#-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

export function reviewedTextConfirmsObligationReference(
  sourceText: string,
  receiptNumber: string,
) {
  const normalizedSource = normalizeLabel(sourceText);
  const normalizedValue = normalizeLabel(receiptNumber);
  if (!normalizedSource || !normalizedValue) return false;
  const escaped = normalizedValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const label =
    "(?:innheimtubref(?:s)?(?: numer| nr)?|collection letter(?: number| no)?|" +
    "lansnumer|lan numer|numer lans|loan(?: number| no)?|" +
    "krafa(?: numer| nr)?|krofunumer|claim(?: number| no)?)";
  return new RegExp(`\\b${label}\\s+${escaped}\\b`, "iu").test(
    normalizedSource,
  );
}

function occurrenceEvidenceFromMatch(
  match: RegExpExecArray,
): ReviewedInstallmentEvidence | null {
  const sequence = Number(match[2]);
  const total = Number(match[3]);

  if (
    !Number.isSafeInteger(sequence) ||
    !Number.isSafeInteger(total) ||
    sequence < 1 ||
    total < 1 ||
    sequence > total
  ) {
    return null;
  }

  return {
    fieldLabel: match[1],
    sequenceText: String(sequence),
    totalText: String(total),
    verbatimText: match[0],
  };
}

/**
 * Extracts an occurrence identity independently of document/vendor vocabulary.
 *
 * "13 af 84" / "13 of 84" is treated as schedule-shaped source evidence.
 * The word immediately preceding the sequence is retained only as provenance;
 * it is NOT a semantic allow-list.
 *
 * Multiple different N/M values are ambiguous and therefore fail closed.
 * Slash notation remains conservative because dates such as 01/02 are common.
 */
export function findDeterministicOccurrenceEvidence(
  sourceText: string,
): ReviewedInstallmentEvidence | null {
  const normalized = normalizeReviewedCanonicalText(sourceText);
  const unique = new Map<string, ReviewedInstallmentEvidence>();

  // "N af M" / "N of M" keeps the printed field word for provenance, without
  // requiring vendor names or issuer-specific labels.
  const writtenPattern =
    /\b([\p{L}\p{M}][\p{L}\p{M}'’.-]*)\s*[:#-]?\s*(\d{1,5})\s+(?:af|of)\s+(\d{1,6})\b/giu;

  // Slash notation requires installment-shaped vocabulary. Unqualified N/M is
  // also used for dates, fractions and table cells and cannot prove an instance.
  const slashPatterns = [
    /\b(Gjalddag(?:i|a))\s*[:#-]?\s*(\d{1,5})\s*\/\s*(\d{1,6})\b/giu,
    /\b(Afborgun(?:arnumer|arnúmer|arnr\.?| numer| númer| nr\.?)?)\s*[:#-]?\s*(\d{1,5})\s*\/\s*(\d{1,6})\b/giu,
    /\b(Installment)\s*[:#-]?\s*(\d{1,5})\s*\/\s*(\d{1,6})\b/giu,
  ];

  for (const pattern of [writtenPattern, ...slashPatterns]) {
    for (const match of normalized.matchAll(pattern)) {
      const evidence = occurrenceEvidenceFromMatch(match);
      if (!evidence) continue;
      const key = `${evidence.sequenceText}/${evidence.totalText}`;
      if (!unique.has(key)) unique.set(key, evidence);
      // Two distinct schedule-like values on one page are ambiguous even if
      // one was written "af" and another with a slash.
      if (unique.size > 1) return null;
    }
  }

  return unique.size === 1 ? unique.values().next().value ?? null : null;
}

/** Legacy API retained for the reviewed-summary path. */
export const findReviewedOccurrenceEvidence = findDeterministicOccurrenceEvidence;

export function findReviewedInstallmentEvidence(
  sourceText: string,
  receiptNumber: string,
): ReviewedInstallmentEvidence | null {
  if (!reviewedTextConfirmsObligationReference(sourceText, receiptNumber)) {
    return null;
  }

  return findDeterministicOccurrenceEvidence(sourceText);
}

export function reviewedTextContainsReference(
  sourceText: string,
  receiptNumber: string,
) {
  const reference = normalizeReference(receiptNumber);
  return Boolean(reference) && normalizeReference(sourceText).includes(reference);
}
