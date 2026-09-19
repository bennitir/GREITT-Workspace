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
  disposition?: unknown;
  bookingEntryCount?: unknown;
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
  const disposition = String(document.disposition ?? "");
  const bookingEntryCount =
    typeof document.bookingEntryCount === "number" &&
    Number.isFinite(document.bookingEntryCount)
      ? Math.max(0, Math.trunc(document.bookingEntryCount))
      : 0;
  const confidence =
    typeof document.classificationConfidence === "number" &&
    Number.isFinite(document.classificationConfidence)
      ? document.classificationConfidence
      : 0;
  const summary = normalizeIdentityText(document.summary);

  const extractionMetadata =
    document.extractionMetadata &&
    typeof document.extractionMetadata === "object" &&
    !Array.isArray(document.extractionMetadata)
      ? (document.extractionMetadata as Record<string, unknown>)
      : null;

  const canonicalExtraction =
    extractionMetadata?.canonicalExtraction &&
    typeof extractionMetadata.canonicalExtraction === "object" &&
    !Array.isArray(extractionMetadata.canonicalExtraction)
      ? (extractionMetadata.canonicalExtraction as Record<string, unknown>)
      : null;

  const hasCanonicalLoan = Boolean(
    canonicalExtraction?.loanInfo &&
      typeof canonicalExtraction.loanInfo === "object",
  );
  const canonicalInsurancePolicies = Array.isArray(
    canonicalExtraction?.insurancePolicies,
  )
    ? canonicalExtraction.insurancePolicies
    : [];
  const hasCanonicalInsurance = Boolean(
    (canonicalExtraction?.insuranceInfo &&
      typeof canonicalExtraction.insuranceInfo === "object") ||
      canonicalInsurancePolicies.length > 0,
  );
  const hasPaymentSchedule = Boolean(
    document.paymentSchedule &&
      typeof document.paymentSchedule === "object" &&
      !Array.isArray(document.paymentSchedule),
  );

  const hasCoreFacts =
    Boolean(normalizeIdentityText(document.merchantName)) &&
    Boolean(normalizeDate(document.date)) &&
    safeNumber(document.totalAmount) !== null;

  /*
   * Ef fyrri fylgiskjalagreining hefur þegar búið til bókunarlínur er skjalið
   * fyrst og fremst bókhaldsskjal. Innsýn á þá að nýta canonical niðurstöðuna
   * en EKKI lesa sama frumskjalið aftur sjálfkrafa, óháð því hvort flokkun
   * skjalsins varð t.d. UNKNOWN/REVIEW/INSIGHT_SOURCE. Handvirkur
   * "Lesa með Innsýn" er áfram leyfður fyrir dýpri rannsókn.
   */
  if (bookingEntryCount > 0 && disposition !== "INSIGHT_ONLY") {
    return false;
  }

  /*
   * Gögn fyrst, AI síðan:
   * Fylgiskjalagreiningin hefur þegar séð frumskjalið. Við keyrum því ekki
   * sjálfkrafa annað fullt AI-lestur bara vegna þess að skjalið var lán,
   * trygging, afborgunartilkynning eða yfirlit. Ef fyrri greiningin skilaði
   * canonical staðreyndum eiga Innsýn og bókun að deila þeim.
   */
  if (
    (type === "PAYMENT_NOTICE" || type === "STATEMENT") &&
    (hasPaymentSchedule || hasCanonicalLoan || hasCanonicalInsurance || hasCoreFacts)
  ) {
    return false;
  }

  if (
    /\b(lan|lansnumer|hofudstoll|trygging|skirteini|samning|skuldbinding)\b/.test(
      summary,
    ) &&
    (hasCanonicalLoan || hasCanonicalInsurance || hasPaymentSchedule)
  ) {
    return false;
  }

  // Skjöl sem eru í raun bókuð/afgreidd sem INSIGHT_ONLY mega fá dýpri
  // sjálfvirka rannsókn. Sama gildir um hreina samninga/tilboð/upplýsingaskjöl
  // sem hafa engar bókunarlínur. UNKNOWN eitt og sér er EKKI lengur næg ástæða
  // til að borga fyrir annað AI-kall.
  if (
    disposition === "INSIGHT_ONLY" ||
    ((type === "CONTRACT" || type === "OFFER" || type === "INFORMATION") &&
      bookingEntryCount === 0) ||
    (role === "INSIGHT_SOURCE" && bookingEntryCount === 0 && !hasCoreFacts)
  ) {
    return true;
  }

  // REVIEW eða óviss flokkun bíður mannlegrar yfirferðar þegar fyrri lestur
  // hefur þegar gefið gagnlegar staðreyndir. AI má síðan keyra handvirkt ef
  // notandi vill dýpri rannsókn.
  if (hasCoreFacts || hasCanonicalLoan || hasCanonicalInsurance || hasPaymentSchedule) {
    return false;
  }

  return confidence < 0.82 && bookingEntryCount === 0;
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
