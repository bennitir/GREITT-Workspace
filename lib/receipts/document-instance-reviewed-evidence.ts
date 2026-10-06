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
export function findReviewedOccurrenceEvidence(
  sourceText: string,
): ReviewedInstallmentEvidence | null {
  const normalized = normalizeReviewedCanonicalText(sourceText);

  const genericPattern =
    /\b([\p{L}\p{M}][\p{L}\p{M}'’.-]*)\s*[:#-]?\s*(\d{1,5})\s+(?:af|of)\s+(\d{1,6})\b/giu;

  const unique = new Map<string, ReviewedInstallmentEvidence>();

  for (
    let match = genericPattern.exec(normalized);
    match;
    match = genericPattern.exec(normalized)
  ) {
    const evidence = occurrenceEvidenceFromMatch(match);
    if (!evidence) continue;

    unique.set(
      `${evidence.sequenceText}/${evidence.totalText}`,
      evidence,
    );
  }

  if (unique.size === 1) {
    return unique.values().next().value ?? null;
  }

  if (unique.size > 1) {
    return null;
  }

  // Preserve the old slash form conservatively. Unlike "N af M" / "N of M",
  // an arbitrary N/M pair can easily be a date, so slash syntax is not made
  // label-agnostic here.
  const slashPatterns = [
    /\b(Gjalddag(?:i|a))\s*[:#-]?\s*(\d{1,5})\s*\/\s*(\d{1,6})\b/iu,
    /\b(Afborgun(?:arnumer|arnúmer|arnr\.?| numer| númer| nr\.?)?)\s*[:#-]?\s*(\d{1,5})\s*\/\s*(\d{1,6})\b/iu,
    /\b(Installment)\s*[:#-]?\s*(\d{1,5})\s*\/\s*(\d{1,6})\b/iu,
  ];

  for (const pattern of slashPatterns) {
    const match = pattern.exec(normalized);
    if (!match) continue;

    const evidence = occurrenceEvidenceFromMatch(match);
    if (evidence) return evidence;
  }

  return null;
}

export function findReviewedInstallmentEvidence(
  sourceText: string,
  receiptNumber: string,
): ReviewedInstallmentEvidence | null {
  if (!reviewedTextConfirmsObligationReference(sourceText, receiptNumber)) {
    return null;
  }

  return findReviewedOccurrenceEvidence(sourceText);
}

export function reviewedTextContainsReference(
  sourceText: string,
  receiptNumber: string,
) {
  const reference = normalizeReference(receiptNumber);
  return Boolean(reference) && normalizeReference(sourceText).includes(reference);
}
