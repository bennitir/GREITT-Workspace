export type VehicleLoanSummary = {
  documentId: number;
  receiptId: number;
  excerpt: string;
  multipleLoans: boolean;
};

type DocumentSummary = { id: number; receiptId: number; summary: string };
type LoanReference = { id: number; identifierValue: string | null };

/** Exact, boundary-aware loan reference search; never match a substring of another ID. */
function boundedToken(text: string, token: string): boolean {
  const escaped = token.split("").map(ch => [".", "/"].includes(ch) ? `\\${ch}` : ch).join("");
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, "iu").test(text);
}
export function loanReferenceInSummary(summary: string, identifier: string | null): boolean {
  if (!identifier || typeof summary !== "string") return false;
  const ref = identifier.trim();
  if (!/^[\p{L}\p{N}][\p{L}\p{N}./-]{3,39}$/u.test(ref)) return false;
  return boundedToken(summary, ref);
}
/**
 * An exact vehicle-plate occurrence in an extracted summary. The only allowed
 * optional separators are at letter/digit transitions (e.g. JNN32/JNN-32).
 * Keep Unicode boundaries so AXJNN32 or JNN32A cannot be mistaken for JNN32.
 * This is a read-only navigation lead; it never confirms a vehicle-loan link.
 */
function plateMentionSpan(text: string, plate: string): { index: number; length: number } | null {
  if (typeof text !== "string" || typeof plate !== "string") return null;
  const normalized = plate.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-Z0-9]{3,10}$/.test(normalized)) return null;
  const segments = normalized.match(/[A-Z]+|[0-9]+/g);
  if (!segments) return null;
  const flexible = segments.join("(?:[ \t\u00a0]?-[ \t\u00a0]?|[ \t\u00a0]{1,2})?");
  const occurrence = new RegExp(`(^|[^\\p{L}\\p{N}])(${flexible})(?![\\p{L}\\p{N}])`, "iu").exec(text);
  if (!occurrence) return null;
  return { index: occurrence.index + occurrence[1].length, length: occurrence[2].length };
}

function shortExcerpt(source: string, plate: string): string {
  const clean = source.replace(/\s+/g, " ").trim();
  if (clean.length <= 280) return clean;
  const hit = plateMentionSpan(clean, plate);
  const index = hit?.index ?? 0;
  const start = Math.max(0, Math.min(index - 80, clean.length - 240));
  return `${start > 0 ? "\u2026" : ""}${clean.slice(start, start + 240)}${start + 240 < clean.length ? "\u2026" : ""}`;
}

/** Candidate retrieval tokens; do exact bounded matching after the DB query. */
export function vehiclePlateQueryTerms(plate: string): string[] {
  if (typeof plate !== "string") return [];
  const compact = plate.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-Z0-9]{3,10}$/.test(compact)) return [];
  const parts = /^([A-Z]{1,4})([0-9]{2,6})$/.exec(compact);
  if (!parts) return [compact];
  const [, letters, digits] = parts;
  return [compact, `${letters}-${digits}`, `${letters} ${digits}`,
    `${letters}  ${digits}`, `${letters} -${digits}`,
    `${letters}- ${digits}`, `${letters} - ${digits}`,
    `${letters}\t${digits}`, `${letters}\u00a0${digits}`];
}

/**
 * Find same-document co-mentions in already analyzed summaries. An LLM summary
 * might be inaccurate; the result is a navigation lead, never an ownership,
 * security, lien, debt, or posting assertion. No source or database is written.
 */
export function findVehicleLoanDocumentMentions(
  documents: DocumentSummary[], loans: LoanReference[], plate: string,
): Map<number, VehicleLoanSummary[]> {
  const result = new Map<number, VehicleLoanSummary[]>();
  const seen = new Set<string>();
  for (const doc of documents) {
    if (!Number.isSafeInteger(doc.id) || doc.id <= 0 ||
        !Number.isSafeInteger(doc.receiptId) || doc.receiptId <= 0 ||
        !plateMentionSpan(doc.summary, plate)) continue;
    const matches = loans.filter(loan => Number.isSafeInteger(loan.id) && loan.id > 0 &&
      loanReferenceInSummary(doc.summary, loan.identifierValue));
    const multipleLoans = matches.length > 1;
    for (const loan of matches) {
      const key = `${loan.id}:${doc.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const current = result.get(loan.id) ?? [];
      current.push({documentId: doc.id, receiptId: doc.receiptId,
        excerpt: shortExcerpt(doc.summary, plate.trim()), multipleLoans});
      result.set(loan.id, current);
    }
  }
  return result;
}
