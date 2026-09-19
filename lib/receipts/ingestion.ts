import crypto from "crypto";

import { extractTextFromPdfBuffer } from "@/lib/core/pdf-text";

export const RECEIPT_PROCESSING_VERSION = "receipt-v2-data-first";

export type ReceiptSourceSnapshot = {
  sourceText: string | null;
  sourceTextHash: string | null;
  sourceTextSource: "PDF_TEXT" | "NONE";
  deterministicData: Record<string, string | number | boolean | null | string[]>;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeIdentityText(value: unknown) {
  if (typeof value !== "string") return "";

  return normalizeWhitespace(value)
    .toLocaleLowerCase("is-IS")
    .replace(/ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/æ/g, "ae")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeReference(value: unknown) {
  if (typeof value !== "string") return "";
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function safeNumber(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value.trim()
    : parsed.toISOString().slice(0, 10);
}

export function buildReceiptIngestKey(companyId: number, fileHash: string) {
  return crypto
    .createHash("sha256")
    .update(`${companyId}:${fileHash}`)
    .digest("hex");
}

function collectRegexMatches(text: string, regex: RegExp, limit: number) {
  const values: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(regex)) {
    const raw = match[1] ?? match[0] ?? "";
    const value = normalizeWhitespace(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
    if (values.length >= limit) break;
  }

  return values;
}

function buildDeterministicData(text: string) {
  const kennitolur = collectRegexMatches(
    text,
    /\b(\d{6}[- ]?\d{4})\b/g,
    20,
  ).map((value) => value.replace(/\D/g, ""));

  const dates = collectRegexMatches(
    text,
    /\b(\d{1,2}[./-]\d{1,2}[./-](?:20)?\d{2}|20\d{2}[./-]\d{1,2}[./-]\d{1,2})\b/g,
    30,
  );

  const invoiceReferences = collectRegexMatches(
    text,
    /(?:reikningsn(?:ú|u)mer|reikn\.?\s*nr\.?|reikningur\s*nr\.?|n(?:ó|o)ta\s*nr\.?|invoice\s*(?:no\.?|number))\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{2,})/gi,
    20,
  );

  const amountCandidates = collectRegexMatches(
    text,
    /\b(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(?:kr\.?|ISK)\b/gi,
    40,
  );

  return {
    kennitolur,
    dates,
    invoiceReferences,
    amountCandidates,
    characterCount: text.length,
  };
}

/**
 * Fyrsta deterministic skref fylgiskjals. PDF-textalag er lesið áður en AI
 * fær skjalið. Skannað PDF og myndir falla örugglega niður í NONE og halda
 * áfram í venjulegt sjónrænt AI-lestur.
 */
export async function buildReceiptSourceSnapshot(input: {
  fileName: string;
  buffer: Buffer;
}): Promise<ReceiptSourceSnapshot> {
  const extension = input.fileName.toLowerCase().split(".").pop() ?? "";

  if (extension !== "pdf") {
    return {
      sourceText: null,
      sourceTextHash: null,
      sourceTextSource: "NONE",
      deterministicData: {
        characterCount: 0,
        reason: "NON_PDF_SOURCE",
      },
    };
  }

  try {
    const rawText = await extractTextFromPdfBuffer(input.buffer);
    const sourceText = rawText.trim();

    if (!sourceText) {
      return {
        sourceText: null,
        sourceTextHash: null,
        sourceTextSource: "NONE",
        deterministicData: {
          characterCount: 0,
          reason: "PDF_WITHOUT_TEXT_LAYER",
        },
      };
    }

    return {
      sourceText,
      sourceTextHash: crypto
        .createHash("sha256")
        .update(sourceText)
        .digest("hex"),
      sourceTextSource: "PDF_TEXT",
      deterministicData: buildDeterministicData(sourceText),
    };
  } catch (error) {
    return {
      sourceText: null,
      sourceTextHash: null,
      sourceTextSource: "NONE",
      deterministicData: {
        characterCount: 0,
        reason: "PDF_TEXT_READ_FAILED",
        error:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "UNKNOWN_ERROR",
      },
    };
  }
}

export type DetectedDocumentLike = {
  merchantName?: unknown;
  merchantKennitala?: unknown;
  date?: unknown;
  receiptNumber?: unknown;
  totalAmount?: unknown;
  pageNumber?: unknown;
  summary?: unknown;
  documentType?: unknown;
  documentRole?: unknown;
  classificationConfidence?: unknown;
  environmentReviewRequired?: unknown;
  [key: string]: unknown;
};

export function buildDetectedDocumentFingerprint(
  document: DetectedDocumentLike,
) {
  const merchantKennitala = normalizeReference(document.merchantKennitala);
  const merchantName = normalizeIdentityText(document.merchantName);
  const receiptNumber = normalizeReference(document.receiptNumber);
  const date = normalizeDate(document.date);
  const amount = safeNumber(document.totalAmount);
  const pageNumber =
    typeof document.pageNumber === "number" &&
    Number.isFinite(document.pageNumber)
      ? document.pageNumber
      : null;
  const summary = normalizeIdentityText(document.summary).slice(0, 240);

  const identity = receiptNumber
    ? {
        mode: "REFERENCE",
        merchant: merchantKennitala || merchantName,
        receiptNumber,
        date,
        amount,
      }
    : {
        mode: "CONTENT",
        merchant: merchantKennitala || merchantName,
        date,
        amount,
        pageNumber,
        summary,
      };

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(identity))
    .digest("hex");
}

/**
 * Ver AI-splitting gegn því að nákvæmlega sama sjálfstæða skjalið komi tvisvar
 * eða þrisvar í sama svari. Við sameinum aðeins sams konar fingerprint;
 * sambærileg upphæð ein og sér er aldrei nóg.
 */
export function dedupeDetectedDocuments<T extends DetectedDocumentLike>(
  documents: T[],
) {
  const seen = new Set<string>();
  const unique: T[] = [];
  const droppedFingerprints: string[] = [];

  for (const document of documents) {
    const fingerprint = buildDetectedDocumentFingerprint(document);

    if (seen.has(fingerprint)) {
      droppedFingerprints.push(fingerprint);
      continue;
    }

    seen.add(fingerprint);
    unique.push(document);
  }

  return {
    documents: unique,
    droppedCount: documents.length - unique.length,
    droppedFingerprints,
  };
}

export function shouldRunDeepInsight(document: DetectedDocumentLike) {
  const type = String(document.documentType ?? "UNKNOWN");
  const role = String(document.documentRole ?? "REVIEW");
  const confidence =
    typeof document.classificationConfidence === "number" &&
    Number.isFinite(document.classificationConfidence)
      ? document.classificationConfidence
      : 0;
  const summary = normalizeIdentityText(document.summary);

  const alwaysDeepTypes = new Set([
    "STATEMENT",
    "OFFER",
    "CONTRACT",
    "INFORMATION",
    "PAYMENT_NOTICE",
    "UNKNOWN",
  ]);

  if (alwaysDeepTypes.has(type) || role === "INSIGHT_SOURCE" || role === "REVIEW") {
    return true;
  }

  // Lán, tryggingar og samningsskuldbindingar geta innihaldið miklu meira en
  // bókunarlínuna sjálfa. Þau fá dýpri greiningu þótt skjalið sé bókanlegt.
  if (
    /\b(lan|lansnumer|hofudstoll|trygging|skirteini|samning|skuldbinding)\b/.test(
      summary,
    )
  ) {
    return true;
  }

  const hasCoreFacts =
    Boolean(normalizeIdentityText(document.merchantName)) &&
    Boolean(normalizeDate(document.date)) &&
    safeNumber(document.totalAmount) !== null;

  return !(confidence >= 0.82 && hasCoreFacts);
}

export type PurchaseLineLike = {
  description?: unknown;
  supplierItemCode?: unknown;
  barcode?: unknown;
  quantity?: unknown;
  unit?: unknown;
  unitPrice?: unknown;
  lineTotal?: unknown;
  confidence?: unknown;
  stockCandidate?: unknown;
};

export type InventoryMatchItem = {
  id: number;
  sku: string;
  barcode: string | null;
  name: string;
  isStockTracked: boolean;
};

export function normalizePurchaseLine(input: PurchaseLineLike, lineIndex: number) {
  const description =
    typeof input.description === "string" ? normalizeWhitespace(input.description) : "";
  const supplierItemCode =
    typeof input.supplierItemCode === "string" && input.supplierItemCode.trim()
      ? input.supplierItemCode.trim()
      : null;
  const barcode =
    typeof input.barcode === "string" && input.barcode.trim()
      ? input.barcode.replace(/\s+/g, "").trim()
      : null;

  const finiteOrNull = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

  return {
    lineIndex,
    description,
    normalizedDescription: normalizeIdentityText(description),
    supplierItemCode,
    normalizedSupplierItemCode: supplierItemCode
      ? normalizeReference(supplierItemCode)
      : null,
    barcode,
    quantity: finiteOrNull(input.quantity),
    unit:
      typeof input.unit === "string" && input.unit.trim() ? input.unit.trim() : null,
    unitPrice: finiteOrNull(input.unitPrice),
    lineTotal: finiteOrNull(input.lineTotal),
    extractionConfidence: finiteOrNull(input.confidence),
    stockCandidate: input.stockCandidate === true,
  };
}

/**
 * Örugg deterministic pörun vörulínu við vöruskrá. Við notum aðeins sterk
 * auðkenni eða nákvæma normalíseraða samsvörun. Fuzzy/AI-pörun má síðar bætast
 * við sem tillaga, en fær aldrei að stofna birgðahreyfingu sjálfkrafa.
 */
export function matchPurchaseLineToInventory(
  line: ReturnType<typeof normalizePurchaseLine>,
  items: InventoryMatchItem[],
) {
  const stockItems = items.filter((item) => item.isStockTracked);

  if (line.barcode) {
    const matches = stockItems.filter(
      (item) => (item.barcode ?? "").replace(/\s+/g, "") === line.barcode,
    );
    // Strikamerki á helst að vera sterkt auðkenni, en InventoryItem leyfir
    // enn tvöfalt barcode. Pörum því aðeins sjálfvirkt þegar niðurstaðan er einstök.
    if (matches.length === 1) {
      return { itemId: matches[0].id, source: "BARCODE", confidence: 1 };
    }
  }

  if (line.normalizedSupplierItemCode) {
    const match = stockItems.find(
      (item) => normalizeReference(item.sku) === line.normalizedSupplierItemCode,
    );
    if (match) {
      return { itemId: match.id, source: "SKU", confidence: 0.98 };
    }
  }

  if (line.normalizedDescription) {
    const matches = stockItems.filter(
      (item) => normalizeIdentityText(item.name) === line.normalizedDescription,
    );
    // Heiti eitt og sér er aðeins öruggt ef það vísar á nákvæmlega eina lagerhaldna vöru.
    if (matches.length === 1) {
      return { itemId: matches[0].id, source: "EXACT_NAME", confidence: 0.92 };
    }
  }

  return null;
}
