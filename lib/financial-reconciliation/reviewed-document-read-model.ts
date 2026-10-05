import type { ReviewedDocumentCandidateInput } from "./reviewed-document-provider";

export type ReviewedDocumentReadEntityLink = {
  role: string;
  entity: {
    id: number;
    entityType: string;
    name: string;
    identifierType: string | null;
    identifierValue: string | null;
  };
};

export type ReviewedDocumentReadRow = {
  id: number;
  receiptId: number;
  reviewedAt: Date | null;
  date: Date | null;
  documentType: string | null;
  documentRole: string | null;
  totalAmount: number | null;
  receiptNumber: string | null;
  merchantName: string | null;
  merchantKennitala: string | null;
  pageNumber: number | null;
  documentFingerprint: string | null;
  classificationSource: string | null;
  duplicateMarkedAt: Date | null;
  disposedAt: Date | null;
  disposition: string | null;
  entityLinks: readonly ReviewedDocumentReadEntityLink[];
  financialEventLinks: readonly { role: string; eventId: number }[];
  container?: {
    detectedDocumentCount: number;
    date: Date | null;
    aiDate: Date | null;
    merchantName: string | null;
    merchantKennitala: string | null;
  } | null;
};

export type CanonicalReviewedDocument = ReviewedDocumentCandidateInput & {
  documentPageNumber: number | null;
  documentFingerprint: string | null;
  classificationSource: string | null;
  canonicalPartyEntityIds: readonly number[];
  canonicalFactScope: "AI_DETECTED_DOCUMENT";
};

function nonEmpty(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function uniqueStrings(values: readonly (string | null | undefined)[]) {
  return [...new Set(values.map(nonEmpty).filter((value): value is string => Boolean(value)))];
}

function uniqueNumbers(values: readonly number[]) {
  return [...new Set(values.filter((value) => Number.isSafeInteger(value) && value > 0))];
}

function canonicalPartyLinks(row: ReviewedDocumentReadRow) {
  const organizations = row.entityLinks.filter((link) => link.entity.entityType === "ORGANIZATION");
  const issuers = organizations.filter((link) => link.role === "ISSUER");
  if (issuers.length > 0) return issuers;

  // Older reviewed documents may predate explicit ISSUER roles. A single
  // organization is still deterministic; multiple organizations are not.
  return organizations.length === 1 ? organizations : [];
}

function canUseSingleDocumentContainerFallback(row: ReviewedDocumentReadRow) {
  return row.container?.detectedDocumentCount === 1;
}

function canonicalMerchantName(row: ReviewedDocumentReadRow) {
  return nonEmpty(row.merchantName) ??
    (canUseSingleDocumentContainerFallback(row) ? nonEmpty(row.container?.merchantName) : null);
}

function canonicalDocumentDate(row: ReviewedDocumentReadRow) {
  if (row.date && Number.isFinite(row.date.getTime())) return row.date;
  if (!canUseSingleDocumentContainerFallback(row)) return null;
  const fallback = row.container?.aiDate ?? row.container?.date ?? null;
  return fallback && Number.isFinite(fallback.getTime()) ? fallback : null;
}

function normalizedKennitala(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

function canonicalKennitala(row: ReviewedDocumentReadRow) {
  const local = normalizedKennitala(row.merchantKennitala);
  if (local) return local;

  const candidates = uniqueStrings(
    canonicalPartyLinks(row).map((link) =>
      String(link.entity.identifierType ?? "").trim().toUpperCase() === "KENNITALA"
        ? link.entity.identifierValue
        : null,
    ),
  ).map(normalizedKennitala).filter((value): value is string => Boolean(value));

  if (candidates.length === 1) return candidates[0];
  if (canUseSingleDocumentContainerFallback(row)) {
    return normalizedKennitala(row.container?.merchantKennitala);
  }
  return null;
}

/**
 * Build a company-local alias registry from already classified/reviewed
 * documents. If the same canonical ORGANIZATION entity has appeared under both
 * a trading name and a legal name, both names become read-only evidence for
 * reconciliation. Nothing is learned globally and no merchant is merged by
 * name alone.
 */
export function buildReviewedDocumentPartyAliasIndex(
  rows: readonly ReviewedDocumentReadRow[],
) {
  const aliases = new Map<number, Set<string>>();

  for (const row of rows) {
    const links = canonicalPartyLinks(row);
    for (const link of links) {
      const values = uniqueStrings([link.entity.name, canonicalMerchantName(row)]);
      if (!values.length) continue;
      const set = aliases.get(link.entity.id) ?? new Set<string>();
      for (const value of values) set.add(value);
      aliases.set(link.entity.id, set);
    }
  }

  return new Map(
    [...aliases.entries()].map(([entityId, values]) => [entityId, [...values].sort()]),
  );
}

/**
 * The separated AiDetectedDocument is the canonical reconciliation unit for
 * both bank and card flows. Parent Receipt facts may only be used as a legacy
 * fallback when the container has exactly one detected document; multi-document
 * bundles can therefore never leak merchant/date facts between siblings.
 */
export function materializeCanonicalReviewedDocuments(
  rows: readonly ReviewedDocumentReadRow[],
): CanonicalReviewedDocument[] {
  const aliasIndex = buildReviewedDocumentPartyAliasIndex(rows);

  return rows.flatMap((row) => {
    if (!Number.isSafeInteger(row.id) || !Number.isSafeInteger(row.receiptId)) return [];
    if (!row.reviewedAt || !Number.isFinite(row.reviewedAt.getTime())) return [];
    if (row.totalAmount === null || !Number.isFinite(row.totalAmount) || row.totalAmount === 0) return [];
    if (row.duplicateMarkedAt || row.disposedAt || row.disposition) return [];

    const partyLinks = canonicalPartyLinks(row);
    const canonicalPartyEntityIds = uniqueNumbers(partyLinks.map((link) => link.entity.id));
    const merchantName = canonicalMerchantName(row);
    const effectiveDate = canonicalDocumentDate(row);
    const partyAliases = uniqueStrings([
      merchantName,
      ...partyLinks.map((link) => link.entity.name),
      ...canonicalPartyEntityIds.flatMap((entityId) => aliasIndex.get(entityId) ?? []),
    ]);
    const invoiceIdentifiers = uniqueStrings(
      row.entityLinks
        .filter((link) => link.entity.entityType === "INVOICE")
        .map((link) => link.entity.identifierValue),
    );

    return [{
      documentId: row.id,
      receiptId: row.receiptId,
      reviewedAt: row.reviewedAt,
      effectiveDate,
      documentType: row.documentType,
      documentRole: row.documentRole,
      totalAmount: row.totalAmount,
      merchantName,
      merchantKennitala: canonicalKennitala(row),
      receiptNumber: row.receiptNumber,
      invoiceIdentifiers,
      hasPrimaryFinancialEvent: row.financialEventLinks.some((link) => link.role === "PRIMARY"),
      partyAliases,
      canonicalPartyEntityIds,
      documentPageNumber: row.pageNumber,
      documentFingerprint: row.documentFingerprint,
      classificationSource: row.classificationSource,
      canonicalFactScope: "AI_DETECTED_DOCUMENT" as const,
    }];
  });
}
