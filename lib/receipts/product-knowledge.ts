import type { Prisma } from "@/app/generated/prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizeIdentityText } from "@/lib/receipts/ingestion";

export type LearnedReceiptContext = "FOOD_SERVICE" | "FUEL" | "UNKNOWN";
export type GlobalProductKind =
  | "CONSUMABLE"
  | "FUEL"
  | "MATERIAL"
  | "EQUIPMENT"
  | "SERVICE"
  | "OTHER";

type PurchaseLineFact = {
  lineIndex: number;
  description: string;
  normalizedDescription: string;
  stockCandidate: boolean;
  supplierItemCode: string | null;
  barcode: string | null;
  quantity: number | null;
  unit: string | null;
  lineTotal: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Les canonical purchaseLines úr extractionMetadata óháð því hvort Birgðir
 * er virkt. Þannig má bókhalds-/vöruþekking læra af öllum fyrirtækjum án þess
 * að krefjast lager-einingarinnar.
 */
export function readCanonicalPurchaseLines(
  extractionMetadata: unknown,
): PurchaseLineFact[] {
  const metadata = asRecord(extractionMetadata);
  const canonicalExtraction = asRecord(metadata?.canonicalExtraction);
  const rawLines = Array.isArray(canonicalExtraction?.purchaseLines)
    ? canonicalExtraction.purchaseLines
    : [];

  return rawLines.flatMap((raw, lineIndex) => {
    const line = asRecord(raw);
    if (!line) return [];

    const description = stringOrNull(line.description);
    if (!description) return [];

    return [
      {
        lineIndex,
        description,
        normalizedDescription: normalizeIdentityText(description),
        stockCandidate: line.stockCandidate === true,
        supplierItemCode: stringOrNull(line.supplierItemCode),
        barcode: stringOrNull(line.barcode),
        quantity: finiteNumber(line.quantity),
        unit: stringOrNull(line.unit),
        lineTotal: finiteNumber(line.lineTotal),
      },
    ];
  });
}

const NON_SHAREABLE_PATTERNS = [
  /@/,
  /\b\d{6}[- ]?\d{4}\b/, // kennitala
  /\b(?:iban|swift|reikning(?:ur|snr)?|account)\b/i,
  /\b(?:visa|mastercard|maestro|amex)\b[^\n]{0,24}\d{4}\b/i,
  /\b(?:sími|simi|phone|tel)\b/i,
];

const NON_PRODUCT_LINE_PATTERNS = [
  /\b(?:vsk|vat|samtals|heild|greiðsla|greidsla|afslátt|afslatt)\b/i,
  /\b(?:þjónusta|thjonusta|vinna|gjald|fee|tax|skatt|leiga|rent)\b/i,
  /\b(?:trygging|insurance|vextir|interest|afborgun)\b/i,
];

const NOISE_TOKENS = new Set([
  "stk",
  "st",
  "pcs",
  "pc",
  "ea",
  "each",
  "kg",
  "g",
  "mg",
  "l",
  "ltr",
  "liter",
  "litri",
  "ml",
  "cl",
  "kr",
  "isk",
]);

/**
 * Canonical vörulykill á að lýsa vörunni, ekki bókhaldsreikningi eða fyrirtæki.
 * Við fjarlægjum einfaldan magn-/stærðarhávaða en varðveitum vörumerki og heiti.
 */
export function buildGlobalProductCanonicalKey(description: string) {
  const rawNormalized = normalizeIdentityText(description);
  if (!rawNormalized || rawNormalized.length < 3 || rawNormalized.length > 180) {
    return null;
  }
  if (NON_SHAREABLE_PATTERNS.some((pattern) => pattern.test(description))) {
    return null;
  }
  if (NON_PRODUCT_LINE_PATTERNS.some((pattern) => pattern.test(rawNormalized))) {
    return null;
  }

  const tokens = rawNormalized
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !/^\d+(?:[.,]\d+)?$/.test(token))
    .filter((token) => !/^\d+(?:ml|cl|l|g|kg|mg)$/.test(token))
    .filter((token) => !NOISE_TOKENS.has(token));

  if (tokens.length === 0) return null;
  const key = tokens.slice(0, 12).join("_").slice(0, 160);
  return key.length >= 3 ? key : null;
}

function normalizeAccountName(value: string) {
  return normalizeIdentityText(value).replace(/_/g, " ");
}

/**
 * Þetta er transaction-context, ekki vöruflokkur og ekki reikningslykill.
 * Hann má því nýtast milli mismunandi reikningslykla fyrirtækja.
 */
export function inferReceiptContextFromAccount(account: {
  name: string;
  type: string;
  entryRole: string;
}): LearnedReceiptContext {
  if (!(account.type === "EXPENSE" || account.entryRole === "EXPENSE")) {
    return "UNKNOWN";
  }

  const name = normalizeAccountName(account.name);
  if (/\b(veiting|matur|matar|maltid|kaffi|restaurant)/.test(name)) {
    return "FOOD_SERVICE";
  }
  if (/\b(eldsneyti|bensin|diesel|disel)/.test(name)) {
    return "FUEL";
  }
  return "UNKNOWN";
}

function inferProductKindFromReviewedContext(input: {
  line: PurchaseLineFact;
  context: LearnedReceiptContext;
}): { productKind: GlobalProductKind; categoryCode: string | null } | null {
  const { line, context } = input;

  // Fyrsta útgáfan lærir aðeins þegar bókarinn hefur staðfest skýrt samhengi
  // og línan lítur út eins og raunveruleg vara. Við útvíkkum taxonomy síðar
  // án þess að þurfa sérreglu fyrir hvert vöruheiti.
  const looksPhysical =
    line.stockCandidate ||
    Boolean(line.barcode) ||
    Boolean(line.supplierItemCode) ||
    (line.quantity !== null && line.quantity > 0);

  if (!looksPhysical) return null;

  if (context === "FOOD_SERVICE") {
    return { productKind: "CONSUMABLE", categoryCode: "FOOD_OR_BEVERAGE" };
  }

  if (context === "FUEL") {
    return { productKind: "FUEL", categoryCode: "VEHICLE_FUEL" };
  }

  return null;
}

function confidenceForProductKnowledge(input: {
  confirmationCount: number;
  correctionCount: number;
  independentCompanyCount: number;
}) {
  return Math.max(
    0.2,
    Math.min(
      0.98,
      0.52 +
        Math.min(input.confirmationCount, 8) * 0.03 +
        Math.min(input.independentCompanyCount, 4) * 0.09 -
        Math.min(input.correctionCount, 4) * 0.12,
    ),
  );
}

/**
 * Leiðrétting/yfirferð bókara er kennslan. Vöruþekkingin er sameiginleg en
 * sönnunargögnin varðveita uppruna. Cross-company notkun er aðeins leyfð þegar
 * status verður ACTIVE; CANDIDATE má samt nýtast aftur innan sama fyrirtækis.
 */
export async function learnGlobalProductKnowledgeFromReview(
  tx: Prisma.TransactionClient,
  params: {
    companyId: number;
    receiptId: number;
    documentId: number;
    userId: number;
    extractionMetadata: unknown;
    bookingEntries: Array<{
      account: string;
      debit: number;
      credit: number;
    }>;
  },
) {
  const purchaseLines = readCanonicalPurchaseLines(params.extractionMetadata);
  if (purchaseLines.length === 0) return { learned: 0 };

  const debitAccountNumbers = [
    ...new Set(
      params.bookingEntries
        .filter((entry) => Number(entry.debit) > 0 && Number(entry.credit) === 0)
        .map((entry) => entry.account.trim())
        .filter(Boolean),
    ),
  ];
  if (debitAccountNumbers.length === 0) return { learned: 0 };

  const accounts = await tx.account.findMany({
    where: {
      companyId: params.companyId,
      number: { in: debitAccountNumbers },
      isActive: true,
    },
    select: { id: true, number: true, name: true, type: true, entryRole: true },
  });

  const contexts = [
    ...new Set(
      accounts
        .map((account) => inferReceiptContextFromAccount(account))
        .filter((context) => context !== "UNKNOWN"),
    ),
  ];

  // Ef bókunin er sundurliðuð í fleiri en eitt merkingarlegt samhengi getum
  // við ekki vitað hvaða vörulína á við hvaða kostnaðarlið. Þá lærum við ekki.
  if (contexts.length !== 1) return { learned: 0 };
  const context = contexts[0];

  let learned = 0;

  for (const line of purchaseLines) {
    const canonicalKey = buildGlobalProductCanonicalKey(line.description);
    if (!canonicalKey) continue;

    const inferred = inferProductKindFromReviewedContext({ line, context });
    if (!inferred) continue;

    const evidenceKey = `document:${params.documentId}|line:${line.lineIndex}|kind:${inferred.productKind}`;
    const alreadyRecorded = await tx.globalProductKnowledgeEvidence.findUnique({
      where: { evidenceKey },
      select: { id: true },
    });
    if (alreadyRecorded) continue;

    let knowledge = await tx.globalProductKnowledge.findUnique({
      where: { canonicalKey },
    });

    if (!knowledge) {
      knowledge = await tx.globalProductKnowledge.create({
        data: {
          canonicalKey,
          canonicalName: line.description.trim().slice(0, 180),
          productKind: inferred.productKind,
          categoryCode: inferred.categoryCode,
          status: "CANDIDATE",
          confidence: confidenceForProductKnowledge({
            confirmationCount: 1,
            correctionCount: 0,
            independentCompanyCount: 1,
          }),
          confirmationCount: 1,
          correctionCount: 0,
          independentCompanyCount: 1,
          metadata: {
            source: "BOOKKEEPER_REVIEW",
            taxonomyVersion: "product-knowledge-v1",
          },
        },
      });

      await tx.globalProductKnowledgeEvidence.create({
        data: {
          knowledgeId: knowledge.id,
          companyId: params.companyId,
          receiptId: params.receiptId,
          documentId: params.documentId,
          userId: params.userId,
          evidenceKey,
          observedText: line.description,
          normalizedObservedText: line.normalizedDescription,
          proposedProductKind: inferred.productKind,
          proposedCategoryCode: inferred.categoryCode,
          transactionContext: context,
          action: "CONFIRMED",
        },
      });
      learned += 1;
      continue;
    }

    const existingCompanyEvidence = await tx.globalProductKnowledgeEvidence.findFirst({
      where: { knowledgeId: knowledge.id, companyId: params.companyId },
      select: { id: true },
    });

    const isSameKind = knowledge.productKind === inferred.productKind;
    const nextConfirmationCount = knowledge.confirmationCount + (isSameKind ? 1 : 0);
    const nextCorrectionCount = knowledge.correctionCount + (isSameKind ? 0 : 1);
    const nextIndependentCompanyCount =
      knowledge.independentCompanyCount + (existingCompanyEvidence ? 0 : 1);
    const nextStatus = isSameKind
      ? nextIndependentCompanyCount >= 2
        ? "ACTIVE"
        : knowledge.status === "DISPUTED"
          ? "DISPUTED"
          : "CANDIDATE"
      : "DISPUTED";

    await tx.globalProductKnowledgeEvidence.create({
      data: {
        knowledgeId: knowledge.id,
        companyId: params.companyId,
        receiptId: params.receiptId,
        documentId: params.documentId,
        userId: params.userId,
        evidenceKey,
        observedText: line.description,
        normalizedObservedText: line.normalizedDescription,
        proposedProductKind: inferred.productKind,
        proposedCategoryCode: inferred.categoryCode,
        transactionContext: context,
        action: isSameKind ? "CONFIRMED" : "CONFLICT",
      },
    });

    await tx.globalProductKnowledge.update({
      where: { id: knowledge.id },
      data: {
        status: nextStatus,
        confirmationCount: nextConfirmationCount,
        correctionCount: nextCorrectionCount,
        independentCompanyCount: nextIndependentCompanyCount,
        confidence: confidenceForProductKnowledge({
          confirmationCount: nextConfirmationCount,
          correctionCount: nextCorrectionCount,
          independentCompanyCount: nextIndependentCompanyCount,
        }),
        categoryCode:
          isSameKind && knowledge.categoryCode == null
            ? inferred.categoryCode
            : knowledge.categoryCode,
      },
    });

    learned += 1;
  }

  return { learned };
}

/**
 * Sama fyrirtæki má endurnýta eigin CANDIDATE-lærdóm strax. Annað fyrirtæki
 * fær aðeins að nýta þekkingu sem hefur orðið ACTIVE með sjálfstæðum
 * staðfestingum. Engin fjárhæð, bókunarlykill eða fyrirtækjaupplýsing lekur.
 */
export async function inferReceiptContextFromGlobalProductKnowledge(params: {
  companyId: number;
  extractionMetadata: unknown;
}): Promise<{
  context: LearnedReceiptContext;
  source: "GLOBAL_PRODUCT_KNOWLEDGE" | "NONE";
  matchedProductCount: number;
}> {
  const purchaseLines = readCanonicalPurchaseLines(params.extractionMetadata);
  const keyedLines = purchaseLines
    .map((line) => ({ line, key: buildGlobalProductCanonicalKey(line.description) }))
    .filter((item): item is { line: PurchaseLineFact; key: string } => Boolean(item.key));

  if (keyedLines.length === 0) {
    return { context: "UNKNOWN", source: "NONE", matchedProductCount: 0 };
  }

  const knowledgeRows = await prisma.globalProductKnowledge.findMany({
    where: { canonicalKey: { in: [...new Set(keyedLines.map((item) => item.key))] } },
    select: {
      id: true,
      canonicalKey: true,
      productKind: true,
      status: true,
      evidence: {
        where: { companyId: params.companyId },
        take: 1,
        select: { id: true },
      },
    },
  });

  const usable = new Map(
    knowledgeRows
      .filter((row) => row.status === "ACTIVE" || row.evidence.length > 0)
      .map((row) => [row.canonicalKey, row]),
  );

  const matchedKinds = keyedLines
    .map((item) => usable.get(item.key)?.productKind ?? null)
    .filter((kind): kind is string => Boolean(kind));

  if (matchedKinds.length === 0) {
    return { context: "UNKNOWN", source: "NONE", matchedProductCount: 0 };
  }

  const uniqueKinds = [...new Set(matchedKinds)];
  if (uniqueKinds.length !== 1) {
    return {
      context: "UNKNOWN",
      source: "NONE",
      matchedProductCount: matchedKinds.length,
    };
  }

  // Fail closed: ef margar raunverulegar vörulínur eru á skjalinu viljum við
  // helst að meirihlutinn sé þekktur áður en transaction-context er ályktað.
  const coverage = matchedKinds.length / keyedLines.length;
  if (keyedLines.length > 1 && coverage < 0.6) {
    return {
      context: "UNKNOWN",
      source: "NONE",
      matchedProductCount: matchedKinds.length,
    };
  }

  const productKind = uniqueKinds[0];
  const context: LearnedReceiptContext =
    productKind === "CONSUMABLE"
      ? "FOOD_SERVICE"
      : productKind === "FUEL"
        ? "FUEL"
        : "UNKNOWN";

  return context === "UNKNOWN"
    ? { context, source: "NONE", matchedProductCount: matchedKinds.length }
    : {
        context,
        source: "GLOBAL_PRODUCT_KNOWLEDGE",
        matchedProductCount: matchedKinds.length,
      };
}
