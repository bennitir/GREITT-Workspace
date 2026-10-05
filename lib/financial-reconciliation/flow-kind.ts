/**
 * Canonical reconciliation flow kinds.
 *
 * These are domain codes, never UI copy. UNKNOWN is a deliberate safe result:
 * callers must not infer a more specific flow from weak counterparty or amount
 * evidence alone.
 */
export const RECONCILIATION_FLOW_KINDS = [
  "DOCUMENT_OBLIGATION",
  "BANK_FEE",
  "INTEREST",
  "REVERSAL",
  "CARD_PURCHASE",
  "CARD_ACCOUNT_MOVEMENT",
  "TRANSFER",
  "LOAN_PAYMENT",
  "INCOME_RECEIPT",
  "UNKNOWN",
] as const;

export type ReconciliationFlowKind =
  (typeof RECONCILIATION_FLOW_KINDS)[number];

export const DOCUMENT_OBLIGATION_FLOW_KIND =
  "DOCUMENT_OBLIGATION" as const satisfies ReconciliationFlowKind;

export type BankReconciliationFlowKind = Exclude<
  ReconciliationFlowKind,
  "DOCUMENT_OBLIGATION" | "INCOME_RECEIPT"
>;

export type BankReconciliationFlowEvidence =
  | "BANK_FEE_TEXT"
  | "INTEREST_TEXT"
  | "REVERSAL_TEXT"
  | "CARD_PURCHASE_MARKER"
  | "CARD_ACCOUNT_MOVEMENT_TEXT"
  | "TRANSFER_TEXT"
  | "LOAN_PAYMENT_TEXT"
  | "NO_DETERMINISTIC_FLOW";

export type BankReconciliationFlowClassification = {
  kind: BankReconciliationFlowKind;
  resolution: "DETERMINISTIC" | "UNKNOWN";
  evidence: BankReconciliationFlowEvidence;
};

export type BankReconciliationFlowInput = {
  text: string;
  amount: string | number;
  sourceRawData: string | null;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}*\-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRaw(sourceRawData: string | null) {
  if (!sourceRawData) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(sourceRawData);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

function includesAny(value: string, needles: readonly string[]) {
  return needles.some((needle) => value.includes(needle));
}

function classified(
  kind: Exclude<BankReconciliationFlowKind, "UNKNOWN">,
  evidence: Exclude<BankReconciliationFlowEvidence, "NO_DETERMINISTIC_FLOW">,
): BankReconciliationFlowClassification {
  return { kind, resolution: "DETERMINISTIC", evidence };
}

/**
 * Conservative bank-originated flow classification.
 *
 * Only explicit bank text/structured bank fields can produce a concrete flow.
 * A known counterparty, amount direction, merchant name or kennitala alone is
 * intentionally insufficient. That evidence belongs in later flow-specific
 * candidate providers, not in flow selection.
 */
export function classifyBankReconciliationFlow(
  input: BankReconciliationFlowInput,
): BankReconciliationFlowClassification {
  const raw = parseRaw(input.sourceRawData);
  const paymentExplanation = String(raw.paymentExplanation ?? "");
  const counterparty = String(raw.counterparty ?? "");
  const textKey = String(raw.textKey ?? "");
  const reference = String(raw.reference ?? "");
  const rawCombined = [
    input.text,
    paymentExplanation,
    counterparty,
    textKey,
    reference,
  ].filter(Boolean).join(" | ");
  const combined = normalize(rawCombined);
  const normalizedText = normalize(input.text);

  if (includesAny(combined, [
    "thjonustugjald",
    "bankagjald",
    "faerslugjald",
    "argjald debetkorts",
    "bank fee",
    "service fee",
    "transaction fee",
  ])) return classified("BANK_FEE", "BANK_FEE_TEXT");

  if (includesAny(combined, [
    "utvext",
    "innvext",
    "vaxtafaersla",
    "interest charge",
    "interest income",
    "debit interest",
    "credit interest",
  ])) return classified("INTEREST", "INTEREST_TEXT");

  if (includesAny(combined, [
    "bakfaersla",
    "reversal",
    "reversed transaction",
  ])) return classified("REVERSAL", "REVERSAL_TEXT");

  const cardSuffix = /\*\*[- ]?\d{4}/.test(rawCombined);
  if (cardSuffix || includesAny(combined, [
    "kortakaup",
    "debetkort",
    "uttekt med debetkorti",
    "card purchase",
    "card transaction",
  ])) return classified("CARD_PURCHASE", "CARD_PURCHASE_MARKER");

  if (
    normalizedText === "kreditkort" ||
    includesAny(combined, [
      "kreditkortagreidsla",
      "greidsla kreditkorts",
      "greitt a kreditkort",
      "credit card payment",
      "credit card settlement",
    ])
  ) return classified(
    "CARD_ACCOUNT_MOVEMENT",
    "CARD_ACCOUNT_MOVEMENT_TEXT",
  );

  // More specific obligation/payment language wins over a generic transfer
  // marker if a bank export happens to include both.
  if (includesAny(combined, [
    "afborgun lans",
    "afborgun af lani",
    "lanagreidsla",
    "loan payment",
    "mortgage payment",
  ])) return classified("LOAN_PAYMENT", "LOAN_PAYMENT_TEXT");

  if (includesAny(combined, [
    "millifaersla",
    "millifaerslur",
    "millifaert",
    "bank transfer",
  ])) return classified("TRANSFER", "TRANSFER_TEXT");

  return {
    kind: "UNKNOWN",
    resolution: "UNKNOWN",
    evidence: "NO_DETERMINISTIC_FLOW",
  };
}
