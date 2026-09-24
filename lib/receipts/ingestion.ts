import crypto from "crypto";

import { extractTextFromPdfBuffer } from "@/lib/core/pdf-text";
import { inspectCanonicalReceiptKnowledge } from "@/lib/insight/reconciliation";

export const RECEIPT_PROCESSING_VERSION = "receipt-v4-data-first-labeled";

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

function parseIcelandicDateToIso(value: string) {
  const match = value.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseIcelandicAmount(value: string) {
  const compact = value.replace(/\s+/g, "").trim();
  if (!compact) return null;

  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact.replace(/\./g, "");
  const amount = Number(normalized);

  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}


function normalizeKennitala(value: unknown) {
  return normalizeReference(value).replace(/\D/g, "");
}

function titleCaseDomainBrand(value: string) {
  return value
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function findLabeledInvoiceNumber(text: string) {
  const match = text.match(
    /(?:reikningsnr\.?|reiknings\s*nr\.?|reikningsn(?:ú|u)mer|reikn\.?\s*nr\.?|reikningur\s*nr\.?|invoice\s*(?:no\.?|number))\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{2,})/i,
  );
  return match?.[1]?.trim() ?? null;
}

function findLabeledInvoiceDate(text: string) {
  const patterns = [
    /\bdagsetning\s+reiknings\s*[:#-]?\s*(\d{1,2}[./-]\d{1,2}[./-](?:20)?\d{2})/i,
    /(?:^|\n)\s*dags\.?\s*[:#-]?\s*(\d{1,2}[./-]\d{1,2}[./-](?:20)?\d{2})/im,
    /\bútgáfudagur\s*[:#-]?\s*(\d{1,2}[./-]\d{1,2}[./-](?:20)?\d{2})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const parsed = parseIcelandicDateToIso(match[1]);
    if (parsed) return parsed;
  }

  return null;
}

function findLabeledTotalAmount(text: string) {
  const amount = String.raw`([0-9][0-9.\s]*(?:,[0-9]{1,2})?)`;
  const patterns = [
    new RegExp(String.raw`Samtals\s+ISK\s+með\s+VSK\s*[:#-]?\s*${amount}`, "i"),
    new RegExp(String.raw`(?:^|\n)\s*Samtals\s*[:#-]?\s*${amount}\s*kr\.?\b`, "im"),
    new RegExp(String.raw`Heildarupphæð\s*[:#-]?\s*${amount}\s*(?:kr\.?|ISK)\b`, "i"),
    new RegExp(String.raw`Til\s+greiðslu\s*[:#-]?\s*${amount}\s*(?:kr\.?|ISK)?\b`, "i"),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const parsed = parseIcelandicAmount(match[1]);
    if (parsed !== null && parsed > 0) return parsed;
  }

  return null;
}

function findVatBreakdown(text: string, totalAmount: number) {
  const netDirect = text.match(
    /Samtals\s+ISK\s+án\s+VSK\s*[:#-]?\s*([0-9][0-9.\s]*(?:,[0-9]{1,2})?)/i,
  );
  const vatDirect = text.match(
    /(\d{1,2}(?:[,.]\d+)?)\s*%\s*VSK\s*[:#-]?\s*([0-9][0-9.\s]*(?:,[0-9]{1,2})?)/i,
  );

  if (netDirect && vatDirect) {
    const netAmount = parseIcelandicAmount(netDirect[1]);
    const vatRate = Number(vatDirect[1].replace(",", "."));
    const vatAmount = parseIcelandicAmount(vatDirect[2]);
    if (
      netAmount !== null &&
      vatAmount !== null &&
      vatRate > 0 &&
      roundMoney(netAmount + vatAmount) === roundMoney(totalAmount)
    ) {
      return { netAmount, vatRate, vatAmount };
    }
  }

  const tableMatches = Array.from(
    text.matchAll(
      /([0-9][0-9.\s]*(?:,[0-9]{1,2})?)\s*kr\.?\s+(\d{1,2}(?:[,.]\d+)?)\s*%\s+([0-9][0-9.\s]*(?:,[0-9]{1,2})?)\s*kr\.?\s+([0-9][0-9.\s]*(?:,[0-9]{1,2})?)\s*kr\.?/gi,
    ),
  );

  for (const match of tableMatches) {
    const netAmount = parseIcelandicAmount(match[1]);
    const vatRate = Number(match[2].replace(",", "."));
    const vatAmount = parseIcelandicAmount(match[3]);
    const rowTotal = parseIcelandicAmount(match[4]);
    if (
      netAmount !== null &&
      vatAmount !== null &&
      rowTotal !== null &&
      roundMoney(rowTotal) === roundMoney(totalAmount) &&
      roundMoney(netAmount + vatAmount) === roundMoney(totalAmount)
    ) {
      return { netAmount, vatRate, vatAmount };
    }
  }

  return null;
}

function findSellerIdentityFromLabeledVatLine(
  text: string,
  companyKennitala: string,
  companyName?: string | null,
) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const sellerCandidates: Array<{ kennitala: string; lineIndex: number }> = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/\bvsk\b/i.test(line)) continue;
    const ktMatch = line.match(/\b(\d{6}[- ]?\d{4})\b/);
    if (!ktMatch) continue;
    const kennitala = normalizeKennitala(ktMatch[1]);
    if (!/^\d{10}$/.test(kennitala) || kennitala === companyKennitala) continue;
    sellerCandidates.push({ kennitala, lineIndex: index });
  }

  const uniqueKennitolur = [...new Set(sellerCandidates.map((item) => item.kennitala))];
  if (uniqueKennitolur.length !== 1) return null;

  const sellerKennitala = uniqueKennitolur[0];
  const candidate = sellerCandidates.find((item) => item.kennitala === sellerKennitala)!;
  const nearbyLines = lines
    .slice(Math.max(0, candidate.lineIndex - 4), Math.min(lines.length, candidate.lineIndex + 2))
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
  const normalizedCompanyName = normalizeIdentityText(companyName);

  const legalEntityPattern = /\b([A-ZÁÉÍÓÚÝÞÆÖ0-9][^|]{1,80}?\b(?:ehf|hf|ohf|sf|slf|ses|bs)\.?)\b/i;
  for (const line of nearbyLines) {
    const match = line.match(legalEntityPattern);
    if (
      match &&
      (!normalizedCompanyName || normalizeIdentityText(match[1]) !== normalizedCompanyName)
    ) {
      return {
        merchantName: normalizeWhitespace(match[1]),
        merchantKennitala: sellerKennitala,
      };
    }
  }

  for (const line of lines) {
    const normalized = normalizeWhitespace(line);
    const match = normalized.match(legalEntityPattern);
    if (
      match &&
      (!normalizedCompanyName || normalizeIdentityText(match[1]) !== normalizedCompanyName)
    ) {
      return {
        merchantName: normalizeWhitespace(match[1]),
        merchantKennitala: sellerKennitala,
      };
    }
  }

  const domainMatch = text.match(/(?:@|\b(?:www\.)?)([a-z0-9][a-z0-9-]{1,40})\.(?:is|com|net|org)\b/i);
  const merchantName = domainMatch
    ? titleCaseDomainBrand(domainMatch[1])
    : `Seljandi ${sellerKennitala}`;

  return {
    merchantName,
    merchantKennitala: sellerKennitala,
  };
}

function findPaymentInfo(text: string) {
  const labeledMethod = text.match(/GREIÐSLUMÁTI\s*[:#-]?\s*([^\n]+)/i);
  const cardMatch = text.match(/Greiðslukort\s+(VISA|MASTERCARD|MAESTRO|AMEX|AMERICAN\s+EXPRESS)\b/i);
  const cardLastFourMatch = text.match(
    /\b(VISA|MASTERCARD|MAESTRO|AMEX|AMERICAN\s+EXPRESS)\b[^\n]{0,40}(?:kreditkort|kort)?\s*(?:\n\s*)?(\d{4})\b/i,
  );

  if (cardMatch || cardLastFourMatch) {
    const network = normalizeWhitespace((cardLastFourMatch?.[1] ?? cardMatch?.[1] ?? "").toUpperCase());
    return {
      method: "CARD",
      rawLabel: cardMatch?.[0] ?? cardLastFourMatch?.[0] ?? "Greiðslukort",
      network: network || null,
      lastFour: cardLastFourMatch?.[2] ?? null,
      source: "DOCUMENT_TEXT",
    };
  }

  if (labeledMethod) {
    const rawLabel = normalizeWhitespace(labeledMethod[1]);
    return {
      method: normalizeIdentityText(rawLabel).includes("heimabanki")
        ? "BANK_CLAIM"
        : "OTHER",
      rawLabel,
      network: null,
      lastFour: null,
      source: "DOCUMENT_TEXT",
    };
  }

  return null;
}

export type DeterministicReceiptAccount = {
  number: string;
  name: string;
  type: string;
  entryRole?: string | null;
  isActive?: boolean;
};

/**
 * Fyrsta alvöru 0-AI leið fylgiskjala.
 *
 * Hún er vísvitandi þröng: aðeins texta-PDF úr Konto þar sem fyrirtækið sjálft
 * er ótvíræður seljandi, einn 24% VSK-stofn er á skjalinu og reikningslykillinn
 * gefur nákvæmlega einn öruggan viðskiptakröfu-, tekju- og útskattsreikning.
 * Ef eitt einasta skilyrði bregst skilar fallið null og núverandi AI-leið tekur
 * við óbreytt. Engin ágiskun er leyfð í deterministic leiðinni.
 */
export function tryParseDeterministicKontoSalesInvoice(input: {
  sourceText: string;
  companyName?: string | null;
  companyKennitala?: string | null;
  companyVatRegistered?: boolean | null;
  accounts: DeterministicReceiptAccount[];
}) {
  const text = input.sourceText.replace(/\r\n?/g, "\n").trim();

  if (!/reikningur\s+útgefinn\s+af\s+reikningakerfi\s+konto\b/i.test(text)) {
    return null;
  }

  if (!/^\s*REIKNINGUR\s*$/im.test(text)) return null;
  if (/KREDITREIKNINGUR/i.test(text)) return null;
  if (!/Gjaldmiðill\s+á\s+reikningi:\s*ISK\b/i.test(text)) return null;
  if (input.companyVatRegistered !== true) return null;

  const sellerMatch = text.match(
    /(?:^|\n)\s*([^\n|]{2,120}?)\s*\|\s*(\d{6}[- ]?\d{4})\s*(?:\n|$)/m,
  );
  if (!sellerMatch) return null;

  const sellerName = normalizeWhitespace(sellerMatch[1]);
  const sellerKennitala = sellerMatch[2].replace(/\D/g, "");
  const companyKennitala = normalizeReference(input.companyKennitala).replace(/\D/g, "");

  if (!/^\d{10}$/.test(companyKennitala) || sellerKennitala !== companyKennitala) {
    return null;
  }

  const invoiceNumberMatch = text.match(
    /Reikn\.?\s*nr\.?\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{2,})/i,
  );
  const issueDateMatch = text.match(/ÚTGÁFUDAGUR\s*\n\s*([0-9./-]+)/i);
  const dueDateMatch = text.match(/GJALDDAGI\s*\n\s*([0-9./-]+)/i);
  const finalDueDateMatch = text.match(/EINDAGI\s*\n\s*([0-9./-]+)/i);
  const payerMatch = text.match(/GREIÐANDI\s*\n\s*([^\n]+)/i);

  const receiptNumber = invoiceNumberMatch?.[1]?.trim() ?? "";
  const issueDate = issueDateMatch ? parseIcelandicDateToIso(issueDateMatch[1]) : null;
  const dueDate = dueDateMatch ? parseIcelandicDateToIso(dueDateMatch[1]) : null;
  const finalDueDate = finalDueDateMatch
    ? parseIcelandicDateToIso(finalDueDateMatch[1])
    : null;
  const payerName = payerMatch?.[1] ? normalizeWhitespace(payerMatch[1]) : null;

  if (!receiptNumber || !issueDate) return null;

  const totalMatch =
    text.match(/Heildarupphæð:\s*([0-9][0-9.\s]*(?:,[0-9]{1,2})?)\s*ISK\b/i) ??
    text.match(/TIL\s+GREIÐSLU\s+([0-9][0-9.\s]*(?:,[0-9]{1,2})?)/i);
  const totalAmount = totalMatch ? parseIcelandicAmount(totalMatch[1]) : null;
  if (totalAmount === null || totalAmount <= 0) return null;

  const taxRows = Array.from(
    text.matchAll(
      /S\(\s*(\d{1,2}(?:[,.]\d+)?)%\s*\)\s+([0-9][0-9.\s]*(?:,[0-9]{1,2})?)\s+([0-9][0-9.\s]*(?:,[0-9]{1,2})?)/gi,
    ),
  );

  // Fyrsta útgáfa styður aðeins einn skýran 24% VSK-stofn.
  if (taxRows.length !== 1) return null;

  const vatRate = Number(taxRows[0][1].replace(",", "."));
  const netAmount = parseIcelandicAmount(taxRows[0][2]);
  const vatAmount = parseIcelandicAmount(taxRows[0][3]);

  if (vatRate !== 24 || netAmount === null || vatAmount === null) return null;
  if (netAmount <= 0 || vatAmount < 0) return null;
  if (roundMoney(netAmount + vatAmount) !== roundMoney(totalAmount)) return null;
  if (roundMoney(netAmount * (vatRate / 100)) !== roundMoney(vatAmount)) return null;

  const activeAccounts = input.accounts.filter((account) => account.isActive !== false);
  const receivableAccounts = activeAccounts.filter(
    (account) => account.type === "ACCOUNTS_RECEIVABLE",
  );
  const revenueAccounts = activeAccounts.filter(
    (account) => account.type === "REVENUE" && account.entryRole === "REVENUE",
  );
  const vatOutputAccounts = activeAccounts.filter(
    (account) => account.type === "VAT_OUTPUT",
  );

  if (
    receivableAccounts.length !== 1 ||
    revenueAccounts.length !== 1 ||
    vatOutputAccounts.length !== 1
  ) {
    return null;
  }

  const receivableAccount = receivableAccounts[0];
  const revenueAccount = revenueAccounts[0];
  const vatOutputAccount = vatOutputAccounts[0];

  const bookingEntries = [
    {
      account: receivableAccount.number,
      text: `Viðskiptakrafa vegna reiknings ${receiptNumber}${payerName ? ` – ${payerName}` : ""}`,
      debit: totalAmount,
      credit: 0,
      entryRole: "GENERAL",
    },
    {
      account: revenueAccount.number,
      text: `Sölutekjur skv. reikningi ${receiptNumber}`,
      debit: 0,
      credit: netAmount,
      entryRole: "GENERAL",
    },
    {
      account: vatOutputAccount.number,
      text: `${vatRate}% útskattur vegna reiknings ${receiptNumber}`,
      debit: 0,
      credit: vatAmount,
      entryRole: "GENERAL",
    },
  ];

  const totalDebit = roundMoney(
    bookingEntries.reduce((sum, entry) => sum + entry.debit, 0),
  );
  const totalCredit = roundMoney(
    bookingEntries.reduce((sum, entry) => sum + entry.credit, 0),
  );
  if (totalDebit !== totalCredit || totalDebit !== roundMoney(totalAmount)) {
    return null;
  }

  const summaryParts = [
    `Sölureikningur ${receiptNumber} frá ${sellerName}${payerName ? ` til ${payerName}` : ""}.`,
    `Útgáfudagur ${issueDate}.`,
    dueDate ? `Gjalddagi ${dueDate}.` : null,
    finalDueDate ? `Eindagi ${finalDueDate}.` : null,
    `Samtals án VSK ${netAmount} kr., ${vatRate}% VSK ${vatAmount} kr. og heild ${totalAmount} kr.`,
  ].filter((value): value is string => Boolean(value));
  const summary = summaryParts.join(" ");

  const document = {
    merchantName: sellerName,
    merchantKennitala: sellerKennitala,
    date: issueDate,
    receiptNumber,
    totalAmount,
    summary,
    documentType: "ACCOUNTING_DOCUMENT",
    documentRole: "BOOKABLE",
    classificationConfidence: 1,
    environmentReviewRequired: false,
    environmentReviewReason: null,
    loanInfo: null,
    insuranceInfo: null,
    insurancePolicies: [],
    paymentSchedule: null,
    purchaseLines: [],
    bookingEntries,
    pageNumber: 1,
  };

  return {
    analysisSource: "DETERMINISTIC_TEMPLATE" as const,
    templateId: "KONTO_SALES_INVOICE_V1" as const,
    result: {
      documentCount: 1,
      documents: [document],
      merchantName: sellerName,
      date: issueDate,
      receiptNumber,
      totalAmount,
      confidence: 1,
      summary,
      suggestedDebitAccount: receivableAccount.number,
      suggestedCreditAccount: revenueAccount.number,
      suggestedBookingText: `Sölureikningur ${receiptNumber}`,
      bookingEntries: bookingEntries.map((entry) => ({
        account: entry.account,
        text: entry.text,
        debit: entry.debit,
        credit: entry.credit,
      })),
    },
  };
}


/**
 * Almenn 0-AI leið fyrir stutt, skýrt merkt innkaupareiknings-PDF.
 *
 * Fallið er fail-closed og reynir ekki að giska á bókhaldslykla. Það þarf:
 * - kennitölu virka fyrirtækisins í textanum,
 * - nákvæmlega eina aðra kennitölu á VSK-línu sem útgefanda,
 * - skýrt merkt reikningsnúmer,
 * - skýrt merkta reikningsdagsetningu,
 * - skýrt merkta heildarupphæð.
 *
 * Þegar þessi grunnatriði eru ótvíræð er óþarfi að greiða AI fyrir að lesa þau.
 * Bókunarlínur eru vísvitandi tómar þar til reikningslykill/mótreikningur er
 * staðfestur með fyrri þekkingu eða af notanda.
 */
export function tryParseDeterministicLabeledPurchaseInvoice(input: {
  sourceText: string;
  companyName?: string | null;
  companyKennitala?: string | null;
}) {
  const text = input.sourceText.replace(/\r\n?/g, "\n").trim();
  const companyKennitala = normalizeKennitala(input.companyKennitala);

  if (!text || text.length > 20_000) return null;
  if (!/^\d{10}$/.test(companyKennitala)) return null;
  if (!text.replace(/\D/g, "").includes(companyKennitala)) return null;
  if (!/\breikningur\b/i.test(text)) return null;
  if (/\bkreditreikningur\b/i.test(text)) return null;

  // Mörg skjöl/yfirlit mega ekki detta inn í eins-skjal deterministic parser.
  const visibleDates = collectRegexMatches(
    text,
    /\b(\d{1,2}[./-]\d{1,2}[./-](?:20)?\d{2}|20\d{2}[./-]\d{1,2}[./-]\d{1,2})\b/g,
    30,
  );
  if (visibleDates.length > 10) return null;

  const seller = findSellerIdentityFromLabeledVatLine(
    text,
    companyKennitala,
    input.companyName,
  );
  const receiptNumber = findLabeledInvoiceNumber(text);
  const issueDate = findLabeledInvoiceDate(text);
  const totalAmount = findLabeledTotalAmount(text);

  if (!seller || !receiptNumber || !issueDate || totalAmount === null || totalAmount <= 0) {
    return null;
  }

  const vat = findVatBreakdown(text, totalAmount);
  const paymentInfo = findPaymentInfo(text);
  const summaryParts = [
    `Reikningur ${receiptNumber} frá ${seller.merchantName}.`,
    `Dagsetning ${issueDate}.`,
    vat
      ? `Samtals án VSK ${vat.netAmount} kr., ${vat.vatRate}% VSK ${vat.vatAmount} kr. og heild ${totalAmount} kr.`
      : `Heild ${totalAmount} kr.`,
    paymentInfo?.rawLabel ? `Greiðslumáti: ${paymentInfo.rawLabel}.` : null,
    "Bókunarlykill og greiðslumótreikningur hafa ekki verið ágiskuð; þau bíða staðfestingar.",
  ].filter((value): value is string => Boolean(value));
  const summary = summaryParts.join(" ");

  const document = {
    merchantName: seller.merchantName,
    merchantKennitala: seller.merchantKennitala,
    date: issueDate,
    receiptNumber,
    totalAmount,
    summary,
    documentType: "ACCOUNTING_DOCUMENT",
    documentRole: "BOOKABLE",
    classificationConfidence: 0.98,
    environmentReviewRequired: false,
    environmentReviewReason: null,
    loanInfo: null,
    insuranceInfo: null,
    insurancePolicies: [],
    paymentSchedule: null,
    paymentInfo,
    purchaseLines: [],
    bookingEntries: [],
    pageNumber: 1,
  };

  return {
    analysisSource: "DETERMINISTIC_TEMPLATE" as const,
    templateId: "LABELED_PURCHASE_INVOICE_V1" as const,
    result: {
      documentCount: 1,
      documents: [document],
      merchantName: seller.merchantName,
      date: issueDate,
      receiptNumber,
      totalAmount,
      confidence: 0.98,
      summary,
      suggestedDebitAccount: null,
      suggestedCreditAccount: null,
      suggestedBookingText: `${seller.merchantName} – ${receiptNumber}`,
      bookingEntries: [],
    },
  };
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
    /(?:reikningsnr\.?|reiknings\s*nr\.?|reikningsn(?:ú|u)mer|reikn\.?\s*nr\.?|reikningur\s*nr\.?|n(?:ó|o)ta\s*nr\.?|invoice\s*(?:no\.?|number))\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{2,})/gi,
    20,
  );

  const amountCandidates = [
    ...collectRegexMatches(
      text,
      /\b(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(?:kr\.?|ISK)\b/gi,
      40,
    ),
    ...collectRegexMatches(
      text,
      /\bISK\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\b/gi,
      40,
    ),
  ].filter((value, index, values) => values.indexOf(value) === index).slice(0, 40);

  const vatNumbers = collectRegexMatches(
    text,
    /\bVSK\.?\s*(?:nr\.?|númer)?\s*[:#-]?\s*(\d{4,8})\b/gi,
    10,
  );

  const paymentMethods = collectRegexMatches(
    text,
    /(?:GREIÐSLUMÁTI\s*[:#-]?\s*([^\n]+)|Greiðslukort\s+([^\n]+))/gi,
    10,
  );

  const cardLastFour = collectRegexMatches(
    text,
    /\b(?:VISA|MASTERCARD|MAESTRO|AMEX|AMERICAN\s+EXPRESS)\b[^\n]{0,40}(?:kreditkort|kort)?\s*(?:\n\s*)?(\d{4})\b/gi,
    10,
  );

  return {
    kennitolur,
    dates,
    invoiceReferences,
    amountCandidates,
    vatNumbers,
    paymentMethods,
    cardLastFour,
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

  // Sama canonical staðreyndalag er notað í Fylgiskjölum og Innsýn.
  // Innsýn á því ekki að búa til sína eigin skilgreiningu á því hvort fyrri
  // lestur hafi þegar skilað endurnýtanlegum staðreyndum.
  const canonicalKnowledge = inspectCanonicalReceiptKnowledge(
    document.extractionMetadata,
  );
  const hasCanonicalLoan = canonicalKnowledge.hasCanonicalLoan;
  const hasCanonicalInsurance = canonicalKnowledge.hasCanonicalInsurance;
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
  if (bookingEntryCount > 0) {
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


export type InventoryEligibilityLine = PurchaseLineLike & {
  matchedItemId?: number | null;
};

const NON_STOCK_DESCRIPTION_PATTERNS = [
  /\btrygging\b/,
  /\btrygginga\w*/,
  /\bskirteini\b/,
  /\bidgjald\w*/,
  /\bvaxt\w*/,
  /\bverdbaet\w*/,
  /\bafborgun\w*/,
  /\bskatt\w*/,
  /\bvsk\b/,
  /\blaun\w*/,
  /\bthjonust\w*/,
  /\bvinna\b/,
  /\bakstur\w*/,
  /\bleiga\b/,
  /\baskrift\w*/,
  /\bsendingarkostnad\w*/,
  /\bflutningskostnad\w*/,
  /\bgreidsludreifing\w*/,
  /\bgreidslugjald\w*/,
  /\binnheimtugjald\w*/,
  /\bafslatt\w*/,
  /\bservice\b/,
  /\binsurance\b/,
  /\binterest\b/,
  /\bfee\b/,
  /\btax\b/,
  /\bsubscription\b/,
];

const PHYSICAL_STOCK_UNITS = new Set([
  "stk", "st", "pcs", "pc", "ea", "each",
  "kg", "g", "mg", "tonn", "t",
  "l", "ltr", "liter", "litri", "ml",
  "m", "m2", "m3", "cm", "mm",
  "pk", "pakki", "pakk", "box", "kassi",
  "roll", "rulla", "rúlla", "sett", "set",
]);

function normalizeUnitForInventory(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .toLocaleLowerCase("is-IS")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/**
 * Varfærin deterministic sía fyrir tillögur um vörumóttöku úr fylgiskjali.
 * AI má merkja línu sem stockCandidate, en sú merking ein og sér dugar ekki.
 * Þekkt lagerhaldsvöruauðkenni eða raunhæf magn/eining þarf líka að liggja fyrir,
 * og augljós þjónusta/gjöld/tryggingar eru alltaf útilokuð.
 */
export function isInventoryEligiblePurchaseLine(input: InventoryEligibilityLine) {
  const description = normalizeIdentityText(input.description);

  if (!description) return false;
  if (NON_STOCK_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(description))) {
    return false;
  }

  if (typeof input.matchedItemId === "number" && Number.isInteger(input.matchedItemId)) {
    return true;
  }

  const barcode =
    typeof input.barcode === "string" ? input.barcode.replace(/\s+/g, "").trim() : "";
  const supplierItemCode =
    typeof input.supplierItemCode === "string" ? normalizeReference(input.supplierItemCode) : "";

  if (barcode || supplierItemCode) {
    return true;
  }

  const quantity =
    typeof input.quantity === "number" && Number.isFinite(input.quantity)
      ? input.quantity
      : null;
  const unit = normalizeUnitForInventory(input.unit);

  return (
    input.stockCandidate === true &&
    quantity !== null &&
    quantity > 0 &&
    PHYSICAL_STOCK_UNITS.has(unit)
  );
}

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
