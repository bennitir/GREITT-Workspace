export type BankAnalysisKind =
  | "BANK_FEE"
  | "INTEREST_INCOME"
  | "CAPITAL_INCOME_TAX"
  | "CARD_PURCHASE"
  | "TRANSFER"
  | "INCOMING_WITH_COUNTERPARTY"
  | "OUTGOING_WITH_COUNTERPARTY"
  | "UNKNOWN";

export type BankAnalysisResolution = "SAFE_RULE" | "PATTERN_REVIEW" | "UNCLEAR";

export type BankAnalysisResult = {
  kind: BankAnalysisKind;
  resolution: BankAnalysisResolution;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  patternKey: string | null;
};

type RawBankData = {
  valueDate?: unknown;
  bankCode?: unknown;
  rbNumber?: unknown;
  category?: unknown;
  transactionNumber?: unknown;
  reference?: unknown;
  textKey?: unknown;
  paymentExplanation?: unknown;
  counterpartyKennitala?: unknown;
  counterparty?: unknown;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalize(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

export function parseRawBankData(sourceRawData: string | null): RawBankData {
  if (!sourceRawData) return {};
  try {
    const parsed = JSON.parse(sourceRawData);
    return parsed && typeof parsed === "object" ? parsed as RawBankData : {};
  } catch {
    return {};
  }
}

export function buildPatternKey(text: string, raw: RawBankData) {
  const kennitala = clean(raw.counterpartyKennitala);
  if (kennitala) return `kt:${kennitala}`;

  // A concrete counterparty/merchant is more specific than a generic bank
  // explanation such as "Úttekt með debetkorti". Keep the card suffix out of
  // the counterparty key: the card is a payment instrument, not the merchant.
  // This also lets the same merchant remain one group when a card is replaced.
  const counterparty = normalize(raw.counterparty);
  if (counterparty) {
    const withoutCardSuffix = counterparty.replace(/,?\s*\*\*-\d{4}\s*$/i, "").trim();
    return `counterparty:${withoutCardSuffix || counterparty}`;
  }

  const explanation = normalize(raw.paymentExplanation);
  if (explanation) return `explanation:${explanation}`;

  const textKey = normalize(raw.textKey);
  if (textKey) return `textkey:${textKey}`;

  const fallback = normalize(text);
  return fallback ? `text:${fallback}` : null;
}



export type BankAiDecision = "AI_NOT_NEEDED" | "WAIT_FOR_DATA" | "AI_CAN_HELP";

export function decideBankAiUse(input: {
  dominantKind: BankAnalysisKind;
  basis: BankSubpattern["basis"];
  receiptCandidateCount: number;
  count: number;
}): { decision: BankAiDecision; reason: "SAFE_RULE" | "RECEIPT_CANDIDATE" | "GENERIC_DATA" | "STRUCTURAL_DATA" | "AI_VALUE" } {
  if (["BANK_FEE", "INTEREST_INCOME", "CAPITAL_INCOME_TAX"].includes(input.dominantKind)) {
    return { decision: "AI_NOT_NEEDED", reason: "SAFE_RULE" };
  }
  if (input.receiptCandidateCount > 0) {
    return { decision: "WAIT_FOR_DATA", reason: "RECEIPT_CANDIDATE" };
  }
  if (input.basis === "GENERIC_TRANSFER") {
    return { decision: "WAIT_FOR_DATA", reason: "GENERIC_DATA" };
  }
  if (input.basis === "STRUCTURAL_BANK_VALUE") {
    return { decision: "WAIT_FOR_DATA", reason: "STRUCTURAL_DATA" };
  }
  return { decision: "AI_CAN_HELP", reason: "AI_VALUE" };
}

export type BankSubpattern = {
  key: string;
  label: string;
  direction: "IN" | "OUT" | "ZERO";
  basis: "EXPLANATION_FAMILY" | "EXACT_BANK_VALUE" | "STRUCTURAL_BANK_VALUE" | "TEXT_KEY" | "GENERIC_TRANSFER" | "OTHER";
};


export function buildStructuralBankValueSubpattern(subgroup: BankSubpattern): BankSubpattern | null {
  if (subgroup.basis !== "EXACT_BANK_VALUE" && subgroup.basis !== "TEXT_KEY") return null;

  const normalizedLabel = normalize(subgroup.label);
  if (!normalizedLabel || !/\d/.test(normalizedLabel)) return null;

  // Collapse varying numeric identifiers into a structural signature. Exact values
  // that genuinely repeat are kept as exact groups by the caller; this fallback is
  // only used for singleton bank values so transaction/settlement IDs do not create
  // one subgroup per row. Provider names and code meanings are deliberately unknown.
  const structural = normalizedLabel
    .replace(/\d+/g, "#")
    .replace(/(?:#[- /.]?){2,}/g, "#-")
    .replace(/\s+/g, " ")
    .trim();

  if (!structural || structural === normalizedLabel) return null;

  const display = clean(subgroup.label)
    .replace(/\d+/g, "?")
    .replace(/(?:\?[- /.]?){2,}/g, "?-")
    .trim();

  return {
    key: `${subgroup.direction}:bank-structure:${structural}`,
    label: display || "Endurtekin formgerð bankagildis",
    direction: subgroup.direction,
    basis: "STRUCTURAL_BANK_VALUE",
  };
}

function directionForAmount(amount: number): BankSubpattern["direction"] {
  if (amount > 0) return "IN";
  if (amount < 0) return "OUT";
  return "ZERO";
}

function compactFamily(value: unknown) {
  return normalize(value)
    .replace(/\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/g, " ")
    .replace(/\b\d+[.,]?\d*\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildBankSubpattern(input: {
  text: string;
  amount: number;
  sourceRawData: string | null;
}): BankSubpattern {
  const raw = parseRawBankData(input.sourceRawData);
  const direction = directionForAmount(input.amount);
  const explanation = normalize(raw.paymentExplanation);
  const textKey = normalize(raw.textKey);
  const combined = normalize([raw.paymentExplanation, raw.textKey, input.text].map(clean).filter(Boolean).join(" | "));

  const knownFamilies: Array<{ needles: string[]; key: string; label: string }> = [
    { needles: ["aefingagjold", "aefingagjold"], key: "training-fees", label: "Æfingagjöld" },
    { needles: ["hvatagreidsl"], key: "incentive-payment", label: "Hvatagreiðslur" },
    { needles: ["arlegt framlag", "arsframlag"], key: "annual-contribution", label: "Árlegt framlag" },
    { needles: ["thatttokugjold", "thatttokugjald"], key: "participation-fee", label: "Þátttökugjöld" },
    { needles: ["motareikning"], key: "tournament-account", label: "Mótareikningur" },
  ];

  // More specific family first: incentive text can also contain training-fee wording.
  const ordered = [knownFamilies[1], knownFamilies[0], ...knownFamilies.slice(2)];
  for (const family of ordered) {
    if (includesAny(combined, family.needles)) {
      return {
        key: `${direction}:family:${family.key}`,
        label: family.label,
        direction,
        basis: "EXPLANATION_FAMILY",
      };
    }
  }

  // Preserve a meaningful bank-provided explanation before collapsing the row into
  // a generic transfer. This is intentionally provider-agnostic: values such as
  // settlement references, batch codes or other repeated bank labels can form
  // useful deterministic subgroups without knowing what the code means.
  const genericTransferNeedles = ["millifaert", "millifaersla", "millifaerslur", "bank transfer", "transfer"];
  if (explanation && !includesAny(explanation, genericTransferNeedles)) {
    return {
      key: `${direction}:bank-value:${explanation}`,
      label: clean(raw.paymentExplanation),
      direction,
      basis: "EXACT_BANK_VALUE",
    };
  }

  // The text-key field can carry the useful repeated value instead of the
  // payment-explanation field, depending on the bank export.
  if (textKey && !includesAny(textKey, genericTransferNeedles)) {
    return {
      key: `${direction}:textkey:${textKey}`,
      label: clean(raw.textKey),
      direction,
      basis: "TEXT_KEY",
    };
  }

  if (includesAny(combined, genericTransferNeedles)) {
    return {
      key: `${direction}:generic-transfer`,
      label: "Almenn millifærsla",
      direction,
      basis: "GENERIC_TRANSFER",
    };
  }

  if (explanation) {
    const family = compactFamily(explanation);
    if (family) return { key: `${direction}:explanation:${family}`, label: clean(raw.paymentExplanation), direction, basis: "OTHER" };
  }

  if (textKey) {
    return { key: `${direction}:textkey:${textKey}`, label: clean(raw.textKey), direction, basis: "TEXT_KEY" };
  }

  return { key: `${direction}:other`, label: "Annað / óflokkað", direction, basis: "OTHER" };
}

export function analyzeBankTransaction(input: {
  text: string;
  amount: number;
  sourceRawData: string | null;
}): BankAnalysisResult {
  const raw = parseRawBankData(input.sourceRawData);
  const combined = normalize([
    input.text,
    raw.paymentExplanation,
    raw.counterparty,
    raw.textKey,
    raw.reference,
  ].map(clean).filter(Boolean).join(" | "));

  const patternKey = buildPatternKey(input.text, raw);

  if (includesAny(combined, [
    "fjarmagnstekjuskatt",
    "capital income tax",
  ])) {
    return {
      kind: "CAPITAL_INCOME_TAX",
      resolution: "SAFE_RULE",
      confidence: "HIGH",
      reason: "capital-income-tax",
      patternKey,
    };
  }

  if (input.amount > 0 && includesAny(combined, [
    "innvext",
    "innvaxt",
    "interest income",
    "credit interest",
  ])) {
    return {
      kind: "INTEREST_INCOME",
      resolution: "SAFE_RULE",
      confidence: "HIGH",
      reason: "interest-income",
      patternKey,
    };
  }

  if (includesAny(combined, [
    "thjonustugjald",
    "bankagjald",
    "faerslugjald",
    "thoknun",
    "commission",
    "service fee",
    "bank fee",
  ])) {
    return {
      kind: "BANK_FEE",
      resolution: "SAFE_RULE",
      confidence: "HIGH",
      reason: "bank-fee-text",
      patternKey,
    };
  }

  if (/\*\*-\d{4}/.test(combined) || includesAny(combined, [
    "kortakaup",
    "debetkort",
    "card purchase",
  ])) {
    return {
      kind: "CARD_PURCHASE",
      resolution: "PATTERN_REVIEW",
      confidence: "MEDIUM",
      reason: "card-marker",
      patternKey,
    };
  }

  if (includesAny(combined, [
    "millifaersla",
    "millifaerslur",
    "bank transfer",
    "transfer",
  ])) {
    return {
      kind: "TRANSFER",
      resolution: "PATTERN_REVIEW",
      confidence: "MEDIUM",
      reason: "transfer-text",
      patternKey,
    };
  }

  const kennitala = clean(raw.counterpartyKennitala);
  if (kennitala && input.amount > 0) {
    return {
      kind: "INCOMING_WITH_COUNTERPARTY",
      resolution: "PATTERN_REVIEW",
      confidence: "MEDIUM",
      reason: "incoming-counterparty",
      patternKey,
    };
  }

  if (kennitala && input.amount < 0) {
    return {
      kind: "OUTGOING_WITH_COUNTERPARTY",
      resolution: "PATTERN_REVIEW",
      confidence: "MEDIUM",
      reason: "outgoing-counterparty",
      patternKey,
    };
  }

  return {
    kind: "UNKNOWN",
    resolution: "UNCLEAR",
    confidence: "LOW",
    reason: "no-safe-rule",
    patternKey,
  };
}
