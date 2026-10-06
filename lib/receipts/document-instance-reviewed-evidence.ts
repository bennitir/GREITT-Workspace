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

export function findReviewedInstallmentEvidence(
  sourceText: string,
  receiptNumber: string,
): ReviewedInstallmentEvidence | null {
  if (!reviewedTextConfirmsObligationReference(sourceText, receiptNumber)) {
    return null;
  }

  const normalized = normalizeReviewedCanonicalText(sourceText);
  const patterns = [
    /\b(Gjalddag(?:i|a))\s*[:#-]?\s*(\d{1,5})\s*(?:af|\/)\s*(\d{1,6})\b/iu,
    /\b(Afborgun(?:arnumer|arnúmer|arnr\.?| numer| númer| nr\.?)?)\s*[:#-]?\s*(\d{1,5})\s*(?:af|\/)\s*(\d{1,6})\b/iu,
    /\b(Installment)\s*[:#-]?\s*(\d{1,5})\s*(?:of|\/)\s*(\d{1,6})\b/iu,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(normalized);
    if (!match) continue;
    const sequence = Number(match[2]);
    const total = Number(match[3]);
    if (
      !Number.isSafeInteger(sequence) ||
      !Number.isSafeInteger(total) ||
      sequence < 1 ||
      total < 1 ||
      sequence > total
    ) {
      continue;
    }
    return {
      fieldLabel: match[1],
      sequenceText: String(sequence),
      totalText: String(total),
      verbatimText: match[0],
    };
  }

  return null;
}

export function reviewedTextContainsReference(
  sourceText: string,
  receiptNumber: string,
) {
  const reference = normalizeReference(receiptNumber);
  return Boolean(reference) && normalizeReference(sourceText).includes(reference);
}
