import { analyzeBankTransaction, buildPatternKey, parseRawBankData } from "./transactions";

export type AnnualBankTransaction = {
  id: number;
  bankAccountId: number;
  bankAccountName?: string | null;
  date: Date;
  text: string;
  amount: number;
  sourceRawData: string | null;
};

export type InternalTransferPair = {
  incomingId: number;
  outgoingId: number;
  amount: number;
  incomingAccountId: number;
  outgoingAccountId: number;
  incomingDate: Date;
  outgoingDate: Date;
  dayDistance: number;
};

const DAY_MS = 86_400_000;

function dayDistance(a: Date, b: Date) {
  return Math.abs(a.getTime() - b.getTime()) / DAY_MS;
}

function amountKey(value: number) {
  return Math.abs(value).toFixed(2);
}

/**
 * Conservative, deterministic pairing of likely transfers between the company's
 * own bank accounts. A pair is only accepted when the opposite amount has a
 * unique candidate on another own account within one calendar day.
 *
 * This is deliberately a reconciliation suggestion, not an accounting posting.
 */
export function findLikelyInternalTransfers(transactions: AnnualBankTransaction[]) {
  const incoming = transactions.filter((item) => item.amount > 0);
  const outgoing = transactions.filter((item) => item.amount < 0);
  const outgoingByAmount = new Map<string, AnnualBankTransaction[]>();

  for (const item of outgoing) {
    const key = amountKey(item.amount);
    const bucket = outgoingByAmount.get(key) ?? [];
    bucket.push(item);
    outgoingByAmount.set(key, bucket);
  }

  const incomingCandidates = new Map<number, AnnualBankTransaction[]>();
  for (const item of incoming) {
    const matches = (outgoingByAmount.get(amountKey(item.amount)) ?? []).filter((candidate) =>
      candidate.bankAccountId !== item.bankAccountId && dayDistance(candidate.date, item.date) <= 1.01
    );
    if (matches.length === 1) incomingCandidates.set(item.id, matches);
  }

  const outgoingUseCount = new Map<number, number>();
  for (const matches of incomingCandidates.values()) {
    const outgoingItem = matches[0];
    outgoingUseCount.set(outgoingItem.id, (outgoingUseCount.get(outgoingItem.id) ?? 0) + 1);
  }

  const pairs: InternalTransferPair[] = [];
  for (const item of incoming) {
    const matches = incomingCandidates.get(item.id);
    if (!matches?.length) continue;
    const outgoingItem = matches[0];
    if ((outgoingUseCount.get(outgoingItem.id) ?? 0) !== 1) continue;

    pairs.push({
      incomingId: item.id,
      outgoingId: outgoingItem.id,
      amount: item.amount,
      incomingAccountId: item.bankAccountId,
      outgoingAccountId: outgoingItem.bankAccountId,
      incomingDate: item.date,
      outgoingDate: outgoingItem.date,
      dayDistance: dayDistance(item.date, outgoingItem.date),
    });
  }

  return pairs.sort((a, b) => b.amount - a.amount || a.incomingDate.getTime() - b.incomingDate.getTime());
}

function counterpartyLabel(transaction: AnnualBankTransaction) {
  const raw = parseRawBankData(transaction.sourceRawData);
  const counterparty = String(raw.counterparty ?? "").trim();
  if (counterparty) {
    // The final four card digits describe the payment instrument, not the
    // counterparty. They remain preserved in the source transaction/raw data.
    return counterparty.replace(/,?\s*\*\*-\d{4}\s*$/i, "").trim() || counterparty;
  }
  return String(raw.paymentExplanation ?? raw.textKey ?? transaction.text ?? "").trim() || "Óþekkt";
}


export type IncomeClassification =
  | "OPERATING_REVENUE"
  | "GRANT_CONTRIBUTION"
  | "PAYMENT_SETTLEMENT"
  | "LOAN_CAPITAL"
  | "REFUND"
  | "OTHER"
  | "UNKNOWN";

export type IncomeConfidence = "HIGH" | "MEDIUM" | "LOW";

export type ClassifiedIncomeGroup = {
  key: string;
  label: string;
  count: number;
  amount: number;
  classification: IncomeClassification;
  confidence: IncomeConfidence;
  evidence: string;
  transactionIds: number[];
  referencePattern?: {
    stem: string;
    variants: string[];
    count: number;
    signal: "REPEATED_SETTLEMENT_PATTERN";
  } | null;
};

function normalizedEvidenceText(transaction: AnnualBankTransaction) {
  const raw = parseRawBankData(transaction.sourceRawData);
  return [
    transaction.text,
    raw.counterparty,
    raw.paymentExplanation,
    raw.textKey,
    raw.reference,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("is-IS");
}

function detectRepeatedReferencePattern(items: AnnualBankTransaction[]) {
  if (items.length < 4) return null;

  const parsed = items.map((transaction) => {
    const raw = parseRawBankData(transaction.sourceRawData);
    const candidates = [raw.reference, raw.paymentExplanation, raw.textKey]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
    for (const candidate of candidates) {
      const match = candidate.match(/^(.{3,}?)[-_\s]?([A-Za-z])$/);
      if (match) return { stem: match[1].trim(), variant: match[2].toUpperCase() };
    }
    return null;
  });

  const usable = parsed.filter((item): item is { stem: string; variant: string } => Boolean(item));
  if (usable.length < 4 || usable.length / items.length < 0.8) return null;

  const stemCounts = new Map<string, number>();
  for (const item of usable) stemCounts.set(item.stem, (stemCounts.get(item.stem) ?? 0) + 1);
  const [stem, count] = Array.from(stemCounts.entries()).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!stem || !count || count / items.length < 0.8) return null;

  const variants = Array.from(new Set(usable.filter((item) => item.stem === stem).map((item) => item.variant))).sort();
  if (variants.length < 2) return null;

  return { stem, variants, count, signal: "REPEATED_SETTLEMENT_PATTERN" as const };
}

export type PriorBankTransactionLink = {
  targetId: number;
  candidateId: number;
  confidence: IncomeConfidence;
  reasons: Array<"SAME_COUNTERPARTY" | "EXACT_AMOUNT" | "LOAN_WORDING">;
  dayDistance: number;
};

/**
 * Conservative deterministic lookup for an earlier bank transaction that may
 * explain a later inflow. This does not create an accounting link: it only
 * returns traceable candidates when independent bank facts line up.
 */
export function findPriorRelatedBankTransactions(
  transactions: AnnualBankTransaction[],
  target: AnnualBankTransaction,
): PriorBankTransactionLink[] {
  const targetRaw = parseRawBankData(target.sourceRawData);
  const targetKennitala = String(targetRaw.counterpartyKennitala ?? "").replace(/\D/g, "");
  const targetCounterparty = String(targetRaw.counterparty ?? "").trim().toLocaleLowerCase("is-IS");

  const links: PriorBankTransactionLink[] = [];

  for (const candidate of transactions) {
    if (candidate.id === target.id || candidate.date >= target.date) continue;

    const days = dayDistance(candidate.date, target.date);
    if (days > 120.01) continue;

    const raw = parseRawBankData(candidate.sourceRawData);
    const kennitala = String(raw.counterpartyKennitala ?? "").replace(/\D/g, "");
    const counterparty = String(raw.counterparty ?? "").trim().toLocaleLowerCase("is-IS");
    const sameCounterparty = Boolean(
      (targetKennitala && kennitala && targetKennitala === kennitala) ||
      (targetCounterparty && counterparty && targetCounterparty === counterparty)
    );
    if (!sameCounterparty) continue;

    const detailText = [raw.paymentExplanation, raw.textKey, raw.reference, candidate.text]
      .filter(Boolean).join(" ").toLocaleLowerCase("is-IS");
    const exactAmount = Math.abs(Math.abs(candidate.amount) - Math.abs(target.amount)) < 0.005;
    const loanWording = /\bl[aá]n\b|\blan\b|loan/i.test(detailText);
    if (!exactAmount && !loanWording) continue;

    const reasons: PriorBankTransactionLink["reasons"] = ["SAME_COUNTERPARTY"];
    if (exactAmount) reasons.push("EXACT_AMOUNT");
    if (loanWording) reasons.push("LOAN_WORDING");

    const confidence: PriorBankTransactionLink["confidence"] =
      exactAmount && candidate.amount * target.amount < 0 ? "HIGH" : "MEDIUM";

    links.push({
      targetId: target.id,
      candidateId: candidate.id,
      confidence,
      reasons,
      dayDistance: days,
    });
  }

  const rank = (value: IncomeConfidence) => value === "HIGH" ? 2 : value === "MEDIUM" ? 1 : 0;
  return links
    .sort((a, b) => rank(b.confidence) - rank(a.confidence) || a.dayDistance - b.dayDistance)
    .slice(0, 5);
}

export function analyzeIncomeEvidence(transaction: AnnualBankTransaction): {
  classification: IncomeClassification;
  confidence: IncomeConfidence;
  evidence: string;
} {
  return classifyIncomeTransactions([transaction]);
}

function classifyIncomeTransactions(items: AnnualBankTransaction[]): {
  classification: IncomeClassification;
  confidence: IncomeConfidence;
  evidence: string;
} {
  const text = items.map(normalizedEvidenceText).join(" | ");
  const bankDetailText = items.map((transaction) => {
    const raw = parseRawBankData(transaction.sourceRawData);
    return [raw.paymentExplanation, raw.textKey, raw.reference]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("is-IS");
  }).join(" | ");

  const receivingAccountText = items
    .map((transaction) => String(transaction.bankAccountName ?? "").trim())
    .filter(Boolean)
    .join(" | ")
    .toLocaleLowerCase("is-IS");

  // Independent deterministic evidence may reinforce itself. The receiving own
  // account is purpose evidence, while explicit bank wording is semantic evidence.
  // We only raise confidence when both point in the same direction; payer identity
  // is never used to create the accounting meaning.
  const grantAccountEvidence = /\bstyrk(?:ir|ja|ur|s)?\b/i.test(receivingAccountText);
  const grantTextEvidence = /\bstyrk|\bframlag|grant|subsid/i.test(text);
  if (grantAccountEvidence && grantTextEvidence) {
    return { classification: "GRANT_CONTRIBUTION", confidence: "HIGH", evidence: "stacked-grant-account-and-text" };
  }
  if (grantAccountEvidence) {
    return { classification: "GRANT_CONTRIBUTION", confidence: "MEDIUM", evidence: "receiving-account-grant" };
  }

  const eventAccountEvidence = /\bm[oó]tareikning/i.test(receivingAccountText);
  const eventTextEvidence = /m[oó]tam[aá]l|m[oó]tagjald|m[oó]tareikning|\bkeppnisgjald/i.test(text);
  if (eventAccountEvidence && eventTextEvidence) {
    return { classification: "OPERATING_REVENUE", confidence: "HIGH", evidence: "stacked-event-account-and-text" };
  }

  // Some bank wording is useful purpose/flow evidence without being enough to
  // determine final accounting recognition. Keep these rows unclassified and
  // expose the evidence for research instead of forcing them into revenue.
  const lotteryPoolEvidence = /\bgetraun(?:ir|um)?\b|\blott(?:o\b|ó(?=$|[^A-Za-zÀ-ÖØ-öø-ÿ]))/i.test(bankDetailText);
  if (lotteryPoolEvidence) {
    return { classification: "UNKNOWN", confidence: "MEDIUM", evidence: "lottery-pool-related-inflow" };
  }

  const loanRefundLinkEvidence = /\bl[aá]n\b/i.test(bankDetailText) && /endurg(?:r|reið)|endurgreið/i.test(bankDetailText);
  if (loanRefundLinkEvidence) {
    return { classification: "UNKNOWN", confidence: "MEDIUM", evidence: "loan-refund-link-needed" };
  }

  // Strong semantic words are deliberately preferred over counterparty identity.
  // This layer must not infer accounting meaning merely from who paid.
  const rules: Array<{
    classification: IncomeClassification;
    confidence: IncomeConfidence;
    evidence: string;
    patterns: RegExp[];
  }> = [
    {
      classification: "LOAN_CAPITAL",
      confidence: "HIGH",
      evidence: "loan",
      patterns: [/\blán\b/i, /\blánveiting/i, /\bloan\b/i],
    },
    {
      classification: "REFUND",
      confidence: "HIGH",
      evidence: "refund",
      patterns: [/endurgreið/i, /refund/i, /bakfær/i],
    },
    {
      classification: "GRANT_CONTRIBUTION",
      confidence: "HIGH",
      evidence: "grant",
      patterns: [/\bstyrk/i, /\bframlag/i, /grant/i, /subsid/i],
    },
    {
      classification: "OPERATING_REVENUE",
      confidence: "HIGH",
      evidence: "operating-revenue",
      patterns: [/æfingagjald/i, /þátttökugjald/i, /félagsgjald/i, /aðgangseyri/i, /mótagjald/i, /mótamála/i, /mótareikning/i, /hvatagreiðsl/i, /\bsala\b/i, /sölutekj/i],
    },
    {
      classification: "PAYMENT_SETTLEMENT",
      confidence: "MEDIUM",
      evidence: "payment-settlement",
      patterns: [/kort[af]?uppgj/i, /posa?uppgj/i, /greiðslumiðl/i, /greiðsluuppgj/i, /söluuppgj/i, /\buppgjör\b/i],
    },
  ];

  for (const rule of rules) {
    const searchableText = rule.classification === "PAYMENT_SETTLEMENT" ? bankDetailText : text;
    if (rule.patterns.some((pattern) => pattern.test(searchableText))) {
      return { classification: rule.classification, confidence: rule.confidence, evidence: rule.evidence };
    }
  }

  return { classification: "UNKNOWN", confidence: "LOW", evidence: "insufficient-bank-evidence" };
}


export type ExpenseClassification =
  | "OPERATING_EXPENSE"
  | "PREMISES"
  | "UTILITIES"
  | "TELECOM"
  | "SOFTWARE"
  | "INSURANCE"
  | "VEHICLE"
  | "TRAVEL"
  | "ADVERTISING"
  | "TRANSPORT"
  | "GOODS_SERVICES"
  | "DINING"
  | "GROCERY_PURCHASE"
  | "OFFICE_SUPPLIES"
  | "RESALE_GOODS"
  | "EVENT_HOSPITALITY"
  | "SPORTS_EVENT"
  | "SPORTS_EQUIPMENT"
  | "TELECOM_EQUIPMENT"
  | "POS_PAYMENT_SERVICE"
  | "ADMIN_REGISTRATION_FEE"
  | "RELATED_ENTITY_FLOW"
  | "GRANT"
  | "CONTRIBUTION"
  | "COST_ALLOWANCE"
  | "WAGES"
  | "PAYROLL_RELATED"
  | "PERSON_PAYMENT"
  | "BANK_FEE"
  | "CASH_WITHDRAWAL"
  | "ASSET_INVESTMENT"
  | "LOAN_CAPITAL"
  | "REFUND"
  | "TAX_FINANCIAL"
  | "OTHER"
  | "MIXED"
  | "UNKNOWN";

export type ExpensePaymentNature =
  | "CARD_PURCHASE"
  | "TRANSFER"
  | "REFUND"
  | "GRANT"
  | "CONTRIBUTION"
  | "COST_ALLOWANCE"
  | "BANK_FEE"
  | "CASH_WITHDRAWAL"
  | "COLLECTION_FEE"
  | "OTHER";

export type ExpensePurposeIndication =
  | "PREMISES"
  | "UTILITIES"
  | "TELECOM"
  | "SOFTWARE"
  | "INSURANCE"
  | "VEHICLE"
  | "TRAVEL"
  | "ADVERTISING"
  | "TRANSPORT"
  | "DINING"
  | "GROCERY_PURCHASE"
  | "OFFICE_SUPPLIES"
  | "RESALE_GOODS"
  | "EVENT_HOSPITALITY"
  | "SPORTS"
  | "SPORTS_EQUIPMENT"
  | "TELECOM_EQUIPMENT"
  | "POS_PAYMENT_SERVICE"
  | "ADMIN_REGISTRATION_FEE"
  | "PREMIUM_UNSPECIFIED"
  | "GOODS_SERVICES"
  | "ASSET_INVESTMENT"
  | "LOAN_CAPITAL"
  | "WAGES"
  | "PAYROLL_RELATED"
  | "PERSON_PAYMENT"
  | "UNKNOWN";

export type ExpenseEvidence = {
  paymentNature: ExpensePaymentNature;
  paymentNatureConfidence: IncomeConfidence;
  paymentNatureEvidence: string;
  purpose: ExpensePurposeIndication;
  purposeConfidence: IncomeConfidence;
  purposeEvidence: string;
};

/**
 * Two-dimensional, deterministic bank evidence. Payment nature answers how the
 * money moved; purpose answers what the wording may be about. Neither is a
 * confirmed bookkeeping account. Keeping them separate prevents e.g. a refund
 * of training fees from being presented as a new sports expense.
 */
export function analyzeExpenseEvidence(item: AnnualBankTransaction): ExpenseEvidence {
  const text = normalizedEvidenceText(item);
  const raw = parseRawBankData(item.sourceRawData);
  const sourceAccountName = String(item.bankAccountName ?? "").toLocaleLowerCase("is-IS");
  const bankKind = analyzeBankTransaction({ text: item.text, amount: item.amount, sourceRawData: item.sourceRawData }).kind;
  const transfer = bankKind === "TRANSFER" || /millif/i.test(String(raw.textKey ?? ""));
  const collectionFee =
    /innheimtukrafa\s*-?\s*kostnaður/i.test(text) ||
    /innheimtukrafa\s*-?\s*kostnadur/i.test(text) ||
    /innheimtukostnað/i.test(text) ||
    /innheimtukostnad/i.test(text);

  let paymentNature: Pick<ExpenseEvidence, "paymentNature" | "paymentNatureConfidence" | "paymentNatureEvidence">;
  const cashWithdrawal = /\blandsbankinn\s+atm\b/i.test(text) || /\batm\s*\d*\b/i.test(text);

  if (cashWithdrawal) {
    paymentNature = { paymentNature: "CASH_WITHDRAWAL", paymentNatureConfidence: "HIGH", paymentNatureEvidence: "atm-cash-withdrawal" };
  } else if (collectionFee) {
    paymentNature = { paymentNature: "COLLECTION_FEE", paymentNatureConfidence: "HIGH", paymentNatureEvidence: "explicit-collection-fee-wording" };
  } else if (/endurgreið|endurgreid|refund|bakfær/i.test(text)) {
    paymentNature = { paymentNature: "REFUND", paymentNatureConfidence: "HIGH", paymentNatureEvidence: "explicit-refund-wording" };
  } else if (transfer && /eldsneyt.*styrk|kostnaðarstyrk|kostnadarstyrk/i.test(text)) {
    paymentNature = { paymentNature: "COST_ALLOWANCE", paymentNatureConfidence: "MEDIUM", paymentNatureEvidence: "labelled-cost-allowance-transfer" };
  } else if (transfer && /\bstyrk/i.test(text)) {
    paymentNature = { paymentNature: "GRANT", paymentNatureConfidence: "MEDIUM", paymentNatureEvidence: "grant-labelled-transfer" };
  } else if (/\bhlaupastyrk/i.test(text)) {
    // A clearly labelled outgoing sponsorship/donation remains a grant-like
    // outflow even when the bank feed presents it as a card purchase rather
    // than a transfer. This is purpose/nature evidence, not an account posting.
    paymentNature = { paymentNature: "GRANT", paymentNatureConfidence: "MEDIUM", paymentNatureEvidence: "explicit-hlaupastyrkur-wording" };
  } else if (transfer && /\bframlag/i.test(text)) {
    paymentNature = { paymentNature: "CONTRIBUTION", paymentNatureConfidence: "MEDIUM", paymentNatureEvidence: "contribution-labelled-transfer" };
  } else if (bankKind === "BANK_FEE") {
    paymentNature = { paymentNature: "BANK_FEE", paymentNatureConfidence: "HIGH", paymentNatureEvidence: "bank-fee-safe-rule" };
  } else if (bankKind === "CARD_PURCHASE") {
    paymentNature = { paymentNature: "CARD_PURCHASE", paymentNatureConfidence: "MEDIUM", paymentNatureEvidence: "card-marker" };
  } else if (transfer) {
    paymentNature = { paymentNature: "TRANSFER", paymentNatureConfidence: "MEDIUM", paymentNatureEvidence: "transfer-text" };
  } else {
    paymentNature = { paymentNature: "OTHER", paymentNatureConfidence: "LOW", paymentNatureEvidence: "insufficient-payment-nature-evidence" };
  }

  const purposeRules: Array<{ purpose: ExpensePurposeIndication; confidence: IncomeConfidence; evidence: string; patterns: RegExp[] }> = [
    { purpose: "WAGES", confidence: "HIGH", evidence: "explicit-wage-wording", patterns: [/\blaun\b/i, /launagreið/i] },
    { purpose: "PAYROLL_RELATED", confidence: "HIGH", evidence: "explicit-payroll-related-wording", patterns: [/tryggingagjald/i, /lífeyr/i, /lifeyr/i, /staðgreið/i, /stadgreid/i] },
    { purpose: "PREMISES", confidence: "MEDIUM", evidence: "premises-wording", patterns: [/húsaleig/i, /husaleig/i, /fasteignagj/i, /húsnæð/i, /husnaed/i] },
    { purpose: "UTILITIES", confidence: "MEDIUM", evidence: "utilities-wording", patterns: [/rafmagn/i, /hitaveit/i, /vatnsveit/i, /fráveit/i, /veitugj/i] },
    { purpose: "TELECOM", confidence: "HIGH", evidence: "confirmed-telecom-internet-counterparty", patterns: [/\binternet á íslandi hf\.?\b/i, /\binternet a islandi hf\.?\b/i] },
    { purpose: "TELECOM", confidence: "MEDIUM", evidence: "telecom-wording", patterns: [/fjarskipt/i, /símaþjón/i, /simathjon/i, /internetþjón/i, /\bsýn hf/i, /\bsimin/i, /\bsímin/i, /\bnova\b/i, /\bhringdu\b/i] },
    { purpose: "SOFTWARE", confidence: "MEDIUM", evidence: "software-wording", patterns: [/hugbúnað/i, /hugbunad/i, /áskrift/i, /subscription/i, /google.*(?:gsuite|g suite|workspace)/i, /dropbox/i, /canva/i, /squarespace|sqsp/i] },
    { purpose: "INSURANCE", confidence: "MEDIUM", evidence: "insurance-wording", patterns: [/trygging/i, /insurance/i] },
    { purpose: "VEHICLE", confidence: "MEDIUM", evidence: "vehicle-wording-or-known-rental-counterparty", patterns: [/eldsneyt/i, /bifreiðakost/i, /bifreidakost/i, /ökutækjakost/i, /okutaekjakost/i, /bílaleiga/i, /bilaleiga/i, /car\s+rental/i, /rent\s*[- ]?a\s*[- ]?car/i, /\bhöldur ehf\b/i, /\bholdur ehf\b/i, /\blöður\b/i, /\blodur\b/i] },
    { purpose: "TRAVEL", confidence: "MEDIUM", evidence: "travel-wording", patterns: [/ferðakost/i, /ferdakost/i, /flugmiða/i, /flugmida/i, /hótel/i, /hotel/i, /gisting/i] },
    { purpose: "ADVERTISING", confidence: "HIGH", evidence: "confirmed-advertising-counterparty-or-wording", patterns: [/augl[yý]sing/i, /marka[ðd]ssetn/i, /advertis/i, /marketing/i, /\bskali merking ehf\b/i, /\bskali merking\b/i, /\br[uú]v sala ehf\b/i, /\bruv sala ehf\b/i, /\bfacebk\b/i] },
    { purpose: "TRANSPORT", confidence: "HIGH", evidence: "explicit-transport-wording", patterns: [/flutningskost/i, /flutning/i, /sendingarkost/i, /v[oö]ruflutning/i, /freight/i, /shipping/i, /cargo/i] },
    { purpose: "DINING", confidence: "HIGH", evidence: "dining-counterparty-or-wording", patterns: [/veiting/i, /matur/i, /grill/i, /restaurant/i, /kim\s+(?:jong|yong)\s+wings/i, /dominos?\s+nordurhell/i, /nings?\s+hlidarsmari/i, /te\s*(?:&|og)?\s*kaffi\s+borgartun/i, /serrano\s+dalshraun/i, /lemon\s+hjallahraun/i] },
    { purpose: "GROCERY_PURCHASE", confidence: "MEDIUM", evidence: "grocery-store-counterparty", patterns: [/\bbónus\b/i, /\bbonus\b/i, /\bkrónan\b/i, /\bkronan\b/i, /\bnettó\b/i, /\bnetto\b/i, /\bcostco\s+wholesal/i, /\bcostco\b/i] },
    { purpose: "OFFICE_SUPPLIES", confidence: "MEDIUM", evidence: "office-supplies-counterparty", patterns: [/\bpenninn\b/i, /\ba4\b/i] },
    { purpose: "SPORTS_EQUIPMENT", confidence: "HIGH", evidence: "confirmed-sports-equipment-counterparty", patterns: [/\baltis ehf\b/i, /\bnamo ehf\.?\b/i, /\bs direct lindir\b/i, /\bicetransport ehf\b/i] },
    { purpose: "RESALE_GOODS", confidence: "MEDIUM", evidence: "confirmed-kiosk-supplier-context", patterns: [/nói[ -]?s[ií]r[ií]us/i, /\bís[ -]?spor\b/i, /\bis[ -]?spor\b/i, /\bkólus\b/i, /\bkolus\b/i, /\biðnmark\b/i, /\bidnmark\b/i, /\bíslensk dreifing ehf\b/i, /\bislensk dreifing ehf\b/i, /\bolgerdin sjalfsalar\b/i, /\bölgerðin sjálfsalar\b/i] },
    { purpose: "EVENT_HOSPITALITY", confidence: "MEDIUM", evidence: "confirmed-event-hospitality-context", patterns: [/\briddarinn\b/i, /norðanfisk/i, /nordanfisk/i, /bl[oó]mab[uú]ðin burkni/i, /blomabudin burkni/i, /v[ií]nb[uú]ðin [aá]lfr[uú]n/i, /vinbudin alfrun/i, /tertugaller/i, /bl[oó]mab[uú]ð m[oö]gdu/i, /blomabud mogdu/i] },
    { purpose: "SPORTS", confidence: "MEDIUM", evidence: "sports-event-wording", patterns: [/æfingagj/i, /aefingagj/i, /mótsgj/i, /motsgj/i, /mótagj/i, /motagj/i, /keppnisgj/i, /þátttökugj/i, /thattokugj/i, /staðfestingargj/i, /stadfestingargj/i, /fararstjór/i, /fararstjor/i, /vegna\s+móts/i, /vegna\s+mots/i, /vegna\s+móta/i, /vegna\s+mota/i, /[a-záðéíóúýþæö]+mót\b/i, /rey\s+cup/i, /\biðkendur?\b.*þróttur/i, /þróttur.*\biðkendur?\b/i, /\b\d+\.\s*fl\.?\b.*þróttur/i, /þróttur.*\b\d+\.\s*fl\.?\b/i, /lokagreiðsla.*uppgjör.*þróttur/i, /uppgjör.*þróttur/i] },
    { purpose: "POS_PAYMENT_SERVICE", confidence: "HIGH", evidence: "explicit-pos-rental-wording", patterns: [/leiga\s+[aá]\s+posa/i, /posaleig/i] },
    { purpose: "ADMIN_REGISTRATION_FEE", confidence: "HIGH", evidence: "explicit-board-change-registration-wording", patterns: [/tilkynning\s+um\s+breytingu\s+[aá]\s+stj[oó]rn/i] },
    { purpose: "PREMIUM_UNSPECIFIED", confidence: "MEDIUM", evidence: "explicit-unspecified-premium-wording", patterns: [/\biðgjöld\b/i, /\bidgjold\b/i] },
    { purpose: "GOODS_SERVICES", confidence: "MEDIUM", evidence: "goods-services-wording", patterns: [/vörukaup/i, /vorukaup/i, /aðföng/i, /adfong/i, /þjónustukaup/i, /thjonustukaup/i, /goods purchase/i, /heildverslun/i] },
    { purpose: "ASSET_INVESTMENT", confidence: "MEDIUM", evidence: "asset-investment-wording", patterns: [/eignakaup/i, /stofnkostnað/i, /fjárfest/i, /fjarfest/i, /fixed asset/i] },
    { purpose: "LOAN_CAPITAL", confidence: "HIGH", evidence: "loan-capital-wording", patterns: [/\bafborgun\b/i, /\blán\b/i, /\blan\b/i, /loan repayment/i] },
  ];
  const tournamentAccount = /móta?reikning|motareikning/i.test(sourceAccountName);
  const counterpartyKennitala = String(raw.counterpartyKennitala ?? "").replace(/\D/g, "");
  const patternKey = buildPatternKey(item.text, raw);

  // Confirmed counterparties should match on stable bank identifiers first.
  // This prevents a known supplier from falling back to UNKNOWN when the raw
  // transaction wording differs from the label shown in the grouped UI.
  const confirmedCounterpartyPurpose: Partial<Record<string, { purpose: ExpensePurposeIndication; confidence: IncomeConfidence; evidence: string }>> = {
    "6312820409": { purpose: "RESALE_GOODS", confidence: "HIGH", evidence: "confirmed-counterparty-kennitala:6312820409" }, // Íslensk dreifing ehf.
    "6509730119": { purpose: "RESALE_GOODS", confidence: "HIGH", evidence: "confirmed-counterparty-kennitala:6509730119" }, // Ís-spor ehf.
    "6008012790": { purpose: "SPORTS_EQUIPMENT", confidence: "HIGH", evidence: "confirmed-counterparty-kennitala:6008012790" }, // Namo ehf.
    "5303131230": { purpose: "ADVERTISING", confidence: "HIGH", evidence: "confirmed-counterparty-kennitala:5303131230" }, // Skali merking ehf.
    "5701200930": { purpose: "ADVERTISING", confidence: "HIGH", evidence: "confirmed-counterparty-kennitala:5701200930" }, // RÚV Sala ehf.
    "6605952449": { purpose: "TELECOM", confidence: "HIGH", evidence: "confirmed-counterparty-kennitala:6605952449" }, // Internet á Íslandi hf.
    "4102830349": { purpose: "GOODS_SERVICES", confidence: "HIGH", evidence: "confirmed-counterparty-kennitala:4102830349" }, // Terra umhverfisþjónusta hf.
  };
  const confirmedPatternPurpose: Partial<Record<string, { purpose: ExpensePurposeIndication; confidence: IncomeConfidence; evidence: string }>> = {
    "counterparty:s direct lindir": { purpose: "SPORTS_EQUIPMENT", confidence: "HIGH", evidence: "confirmed-counterparty-pattern:s-direct-lindir" },
    "counterparty:emobi a islandi ehf": { purpose: "TELECOM_EQUIPMENT", confidence: "HIGH", evidence: "confirmed-counterparty-pattern:emobi-a-islandi-ehf" },
  };
  const confirmedPurpose = confirmedCounterpartyPurpose[counterpartyKennitala] ?? (patternKey ? confirmedPatternPurpose[patternKey] : undefined);
  const purposeMatch = collectionFee || confirmedPurpose ? undefined : purposeRules.find((rule) => rule.patterns.some((pattern) => pattern.test(text)));
  const firstDayDigits = Number(counterpartyKennitala.slice(0, 2));
  const looksLikeIndividualKennitala = counterpartyKennitala.length === 10 && firstDayDigits >= 1 && firstDayDigits <= 31;
  // A personal kennitala is useful counterparty evidence even when a bank feed
  // fails to label the movement as TRANSFER. Do not apply it to card purchases:
  // sole proprietors can legitimately appear as card merchants.
  const individualTransfer = looksLikeIndividualKennitala && bankKind !== "CARD_PURCHASE";
  const purpose = tournamentAccount
    ? { purpose: "SPORTS" as const, purposeConfidence: "HIGH" as IncomeConfidence, purposeEvidence: "tournament-source-account" }
    : confirmedPurpose
      ? { purpose: confirmedPurpose.purpose, purposeConfidence: confirmedPurpose.confidence, purposeEvidence: confirmedPurpose.evidence }
    : purposeMatch
    ? { purpose: purposeMatch.purpose, purposeConfidence: purposeMatch.confidence, purposeEvidence: purposeMatch.evidence }
    : individualTransfer
      ? { purpose: "PERSON_PAYMENT" as const, purposeConfidence: "MEDIUM" as IncomeConfidence, purposeEvidence: "individual-counterparty-kennitala" }
      : { purpose: "UNKNOWN" as const, purposeConfidence: "LOW" as IncomeConfidence, purposeEvidence: "insufficient-purpose-evidence" };

  return { ...paymentNature, ...purpose };
}

export type ExpenseBreakdownItem = {
  classification: ExpenseClassification;
  count: number;
  amount: number;
  transactionIds: number[];
};

export type ClassifiedExpenseGroup = {
  key: string;
  label: string;
  count: number;
  amount: number;
  classification: ExpenseClassification;
  confidence: IncomeConfidence;
  evidence: string;
  transactionIds: number[];
  breakdown: ExpenseBreakdownItem[];
};

export type RecurringExpensePattern = {
  groupKey: string;
  label: string;
  transactionIds: number[];
  count: number;
  monthCount: number;
  amount: number;
  averageAmount: number;
  minAmount: number;
  maxAmount: number;
  confidence: "HIGH" | "MEDIUM";
};

export type FlowThroughSuggestion = {
  incomingId: number;
  outgoingId: number;
  incomingIds: number[];
  outgoingIds: number[];
  bankAccountId: number;
  amount: number;
  incomingDate: Date;
  outgoingDate: Date;
  dayDistance: number;
  incomingLabel: string;
  outgoingLabel: string;
};

export type GrantFlowDestination = {
  label: string;
  amount: number;
  count: number;
  outgoingIds: number[];
};

export type GrantFlowSource = {
  key: string;
  label: string;
  incomingAmount: number;
  incomingCount: number;
  strongMatchedAmount: number;
  unmatchedAmount: number;
  incomingIds: number[];
  destinations: GrantFlowDestination[];
  basis: "BANK_TEXT" | "GRANT_ACCOUNT" | "BOTH";
};

/**
 * Builds a conservative grant-flow view from already classified income groups
 * and strong exact-amount pass-through suggestions. `grantAccountIds` may be
 * supplied by the UI when an own bank account name itself clearly signals a
 * grant/styrkir purpose. That account-name clue is kept separate from bank-text
 * evidence and never turns a flow into a confirmed accounting conclusion.
 */
export function buildGrantFlowSources(
  transactions: AnnualBankTransaction[],
  incomeGroups: ClassifiedIncomeGroup[],
  flowThroughSuggestions: FlowThroughSuggestion[],
  grantAccountIds: Set<number>,
): GrantFlowSource[] {
  const byId = new Map(transactions.map((tx) => [tx.id, tx]));
  const flowByIncomingId = new Map<number, FlowThroughSuggestion[]>();
  for (const pair of flowThroughSuggestions) {
    for (const incomingId of pair.incomingIds) {
      const bucket = flowByIncomingId.get(incomingId) ?? [];
      bucket.push(pair);
      flowByIncomingId.set(incomingId, bucket);
    }
  }
  const grantTextPattern = /\bstyrk|\bframlag|grant|subsid|dotac|грант/i;

  return incomeGroups
    .map((group) => {
      // Be deliberately narrower than the group-level income classification:
      // include only the actual incoming rows whose own bank account or own bank
      // wording carries a grant clue. This prevents one grant-like row from
      // turning every payment from the same counterparty into a grant.
      const incomingIds = group.transactionIds.filter((id) => {
        const tx = byId.get(id);
        if (!tx || tx.amount <= 0) return false;
        return grantAccountIds.has(tx.bankAccountId) || grantTextPattern.test(normalizedEvidenceText(tx));
      });
      if (!incomingIds.length) return null;

      const bankTextEvidence = incomingIds.some((id) => {
        const tx = byId.get(id);
        return Boolean(tx && grantTextPattern.test(normalizedEvidenceText(tx)));
      });
      const accountEvidence = incomingIds.some((id) => {
        const tx = byId.get(id);
        return Boolean(tx && grantAccountIds.has(tx.bankAccountId));
      });

      const destinations = new Map<string, GrantFlowDestination>();
      let strongMatchedAmount = 0;
      const seenFlows = new Set<FlowThroughSuggestion>();
      for (const incomingId of incomingIds) {
        for (const pair of flowByIncomingId.get(incomingId) ?? []) {
          if (seenFlows.has(pair)) continue;
          // Count a grouped match only when all of its incoming rows belong to
          // this grant source. This avoids claiming a partial many-to-one flow.
          if (!pair.incomingIds.every((id) => incomingIds.includes(id))) continue;
          seenFlows.add(pair);
          strongMatchedAmount += pair.amount;
          const label = pair.outgoingLabel || "Óþekkt";
          const current = destinations.get(label) ?? { label, amount: 0, count: 0, outgoingIds: [] };
          current.amount += pair.amount;
          current.count += 1;
          current.outgoingIds.push(...pair.outgoingIds);
          destinations.set(label, current);
        }
      }

      const incomingAmount = incomingIds.reduce((sum, id) => sum + Math.max(0, byId.get(id)?.amount ?? 0), 0);
      const basis: GrantFlowSource["basis"] = bankTextEvidence && accountEvidence
        ? "BOTH"
        : bankTextEvidence
          ? "BANK_TEXT"
          : "GRANT_ACCOUNT";

      return {
        key: group.key,
        label: group.label,
        incomingAmount,
        incomingCount: incomingIds.length,
        strongMatchedAmount,
        unmatchedAmount: Math.max(0, incomingAmount - strongMatchedAmount),
        incomingIds,
        destinations: Array.from(destinations.values()).sort((a, b) => b.amount - a.amount || b.count - a.count),
        basis,
      };
    })
    .filter((group): group is GrantFlowSource => Boolean(group && group.incomingAmount > 0))
    .sort((a, b) => b.incomingAmount - a.incomingAmount || b.incomingCount - a.incomingCount);
}

function classifyExpenseTransactions(
  items: AnnualBankTransaction[],
  analyzedKinds: Map<number, string>,
): { classification: ExpenseClassification; confidence: IncomeConfidence; evidence: string } {
  if (items.length === 0) {
    return { classification: "UNKNOWN", confidence: "LOW", evidence: "insufficient-bank-evidence" };
  }

  const classifyOne = (item: AnnualBankTransaction) => {
    const analyzedKind = analyzedKinds.get(item.id);
    const raw = parseRawBankData(item.sourceRawData);
    const counterpartyKennitala = String(raw.counterpartyKennitala ?? "").replace(/\D/g, "");

    // Transitional relationship evidence for the 2025 Þrótt analysis. These
    // counterparties are known related organisational units, so the outflow
    // belongs in a relationship-flow layer rather than being forced into a
    // normal operating-expense category. Individual transaction purpose is
    // still preserved by analyzeExpenseEvidence() in the research view.
    // Replace this local evidence with the general company/entity relationship
    // model when that model is available.
    if (counterpartyKennitala === "6402120390" || counterpartyKennitala === "6402892529") {
      return {
        classification: "RELATED_ENTITY_FLOW" as const,
        confidence: "HIGH" as IncomeConfidence,
        evidence: `known-related-entity:${counterpartyKennitala}`,
      };
    }

    // These are deterministic bank-structure signals that sit outside the
    // two-dimensional wording layer. Preserve them before interpreting text.
    if (analyzedKind === "CAPITAL_INCOME_TAX") {
      return { classification: "TAX_FINANCIAL" as const, confidence: "HIGH" as IncomeConfidence, evidence: "capital-income-tax-safe-rule" };
    }

    const evidence = analyzeExpenseEvidence(item);

    // A cost allowance can still have a clearly evidenced expense purpose.
    // Keep the payment nature as COST_ALLOWANCE in the evidence layer, but
    // aggregate explicit fuel allowances with vehicle costs. This makes
    // “Eldsneytisstyrkur” and “Eldsneytis <mánuður>” land in the same
    // expense category without losing the distinction in payment nature.
    if (evidence.paymentNature === "COST_ALLOWANCE" && evidence.purpose === "VEHICLE") {
      return {
        classification: "VEHICLE" as const,
        confidence: evidence.purposeConfidence,
        evidence: `${evidence.paymentNatureEvidence}+${evidence.purposeEvidence}`,
      };
    }

    // Payment nature takes precedence when it changes the economic meaning of
    // the outflow. A refund, grant or cost allowance must not be presented as a
    // fresh purchase merely because its subject mentions sports, fuel, etc.
    const natureClassification: Partial<Record<ExpensePaymentNature, ExpenseClassification>> = {
      REFUND: "REFUND",
      GRANT: "GRANT",
      CONTRIBUTION: "CONTRIBUTION",
      COST_ALLOWANCE: "COST_ALLOWANCE",
      BANK_FEE: "BANK_FEE",
      CASH_WITHDRAWAL: "CASH_WITHDRAWAL",
      COLLECTION_FEE: "BANK_FEE",
    };
    const fromNature = natureClassification[evidence.paymentNature];
    if (fromNature) {
      return {
        classification: fromNature,
        confidence: evidence.paymentNatureConfidence,
        evidence: evidence.paymentNatureEvidence,
      };
    }

    const purposeClassification: Partial<Record<ExpensePurposeIndication, ExpenseClassification>> = {
      PREMISES: "PREMISES",
      UTILITIES: "UTILITIES",
      TELECOM: "TELECOM",
      SOFTWARE: "SOFTWARE",
      INSURANCE: "INSURANCE",
      VEHICLE: "VEHICLE",
      TRAVEL: "TRAVEL",
      ADVERTISING: "ADVERTISING",
      TRANSPORT: "TRANSPORT",
      DINING: "DINING",
      GROCERY_PURCHASE: "GROCERY_PURCHASE",
      OFFICE_SUPPLIES: "OFFICE_SUPPLIES",
      RESALE_GOODS: "RESALE_GOODS",
      EVENT_HOSPITALITY: "EVENT_HOSPITALITY",
      SPORTS: "SPORTS_EVENT",
      SPORTS_EQUIPMENT: "SPORTS_EQUIPMENT",
      TELECOM_EQUIPMENT: "TELECOM_EQUIPMENT",
      POS_PAYMENT_SERVICE: "POS_PAYMENT_SERVICE",
      ADMIN_REGISTRATION_FEE: "ADMIN_REGISTRATION_FEE",
      GOODS_SERVICES: "GOODS_SERVICES",
      ASSET_INVESTMENT: "ASSET_INVESTMENT",
      LOAN_CAPITAL: "LOAN_CAPITAL",
      WAGES: "WAGES",
      PAYROLL_RELATED: "PAYROLL_RELATED",
      PERSON_PAYMENT: "PERSON_PAYMENT",
    };
    const fromPurpose = purposeClassification[evidence.purpose];
    if (fromPurpose) {
      return {
        classification: fromPurpose,
        confidence: evidence.purposeConfidence,
        evidence: evidence.purposeEvidence,
      };
    }

    return { classification: "UNKNOWN" as const, confidence: "LOW" as IncomeConfidence, evidence: "insufficient-bank-evidence" };
  };

  const perItem = items.map(classifyOne);
  const first = perItem[0];
  if (perItem.every((item) => item.classification === first.classification)) {
    const confidenceRank: Record<IncomeConfidence, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    const confidence = perItem.reduce<IncomeConfidence>(
      (lowest, item) => confidenceRank[item.confidence] < confidenceRank[lowest] ? item.confidence : lowest,
      first.confidence,
    );
    return {
      classification: first.classification,
      confidence,
      evidence: perItem.every((item) => item.evidence === first.evidence) ? first.evidence : "shared-two-dimensional-evidence",
    };
  }

  return { classification: "MIXED", confidence: "LOW", evidence: "mixed-transaction-evidence" };
}

function expenseClassificationBreakdown(
  items: AnnualBankTransaction[],
  analyzedKinds: Map<number, string>,
): ExpenseBreakdownItem[] {
  const totals = new Map<ExpenseClassification, { count: number; amount: number; transactionIds: number[] }>();
  for (const item of items) {
    const classified = classifyExpenseTransactions([item], analyzedKinds);
    const current = totals.get(classified.classification) ?? { count: 0, amount: 0, transactionIds: [] };
    current.count += 1;
    current.amount += Math.abs(item.amount);
    current.transactionIds.push(item.id);
    totals.set(classified.classification, current);
  }
  return Array.from(totals.entries())
    .map(([classification, value]) => ({ classification, ...value }))
    .sort((a, b) => b.amount - a.amount || b.count - a.count);
}

function classifyExpenseGroup(
  items: AnnualBankTransaction[],
  analyzedKinds: Map<number, string>,
) {
  const breakdown = expenseClassificationBreakdown(items, analyzedKinds);
  const known = breakdown.filter((item) => item.classification !== "UNKNOWN");
  const unknown = breakdown.find((item) => item.classification === "UNKNOWN");

  if (breakdown.length === 1) {
    const only = breakdown[0];
    const base = classifyExpenseTransactions(items, analyzedKinds);
    return { ...base, breakdown };
  }

  if (known.length === 1 && !unknown) {
    const base = classifyExpenseTransactions(items, analyzedKinds);
    return { ...base, breakdown };
  }

  return {
    classification: "MIXED" as ExpenseClassification,
    confidence: "LOW" as IncomeConfidence,
    evidence: "mixed-transaction-evidence",
    breakdown,
  };
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Finds one strong recurring monthly amount pattern inside a counterparty group.
 * The result is deliberately neutral: regularity is evidence of cadence, not proof
 * of payroll, rent or any other accounting meaning.
 */
function detectRecurringMonthlyPattern(
  groupKey: string,
  label: string,
  items: AnnualBankTransaction[],
): RecurringExpensePattern | null {
  if (items.length < 6) return null;

  const outgoing = items.filter((item) => item.amount < 0);
  if (outgoing.length < 6) return null;

  const byMonth = new Map<string, AnnualBankTransaction[]>();
  for (const item of outgoing) {
    const key = monthKey(item.date);
    const bucket = byMonth.get(key) ?? [];
    bucket.push(item);
    byMonth.set(key, bucket);
  }
  if (byMonth.size < 6) return null;

  let best: { items: AnnualBankTransaction[]; target: number } | null = null;
  const anchors = outgoing.map((item) => Math.abs(item.amount)).filter((amount) => amount > 0);

  for (const target of anchors) {
    const chosen: AnnualBankTransaction[] = [];
    for (const bucket of byMonth.values()) {
      const candidates = bucket
        .map((item) => ({ item, amount: Math.abs(item.amount) }))
        .filter(({ amount }) => Math.abs(amount - target) / target <= 0.25)
        .sort((a, b) => Math.abs(a.amount - target) - Math.abs(b.amount - target));
      if (candidates[0]) chosen.push(candidates[0].item);
    }

    if (chosen.length < 6) continue;
    const avg = chosen.reduce((sum, item) => sum + Math.abs(item.amount), 0) / chosen.length;
    const currentScore = chosen.length * Math.log10(Math.max(10, avg));
    const bestAvg = best
      ? best.items.reduce((sum, item) => sum + Math.abs(item.amount), 0) / best.items.length
      : 0;
    const bestScore = best ? best.items.length * Math.log10(Math.max(10, bestAvg)) : -1;
    if (!best || currentScore > bestScore) best = { items: chosen, target };
  }

  if (!best) return null;
  const amounts = best.items.map((item) => Math.abs(item.amount));
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  return {
    groupKey,
    label,
    transactionIds: best.items.map((item) => item.id),
    count: best.items.length,
    monthCount: new Set(best.items.map((item) => monthKey(item.date))).size,
    amount: total,
    averageAmount: total / best.items.length,
    minAmount: Math.min(...amounts),
    maxAmount: Math.max(...amounts),
    confidence: best.items.length >= 10 ? "HIGH" : "MEDIUM",
  };
}

/**
 * Suggests simple pass-through flows on the same own bank account: an external
 * inflow and external outflow of the exact same amount within two days. Both
 * sides must be unique to avoid manufacturing links from repeated round amounts.
 */
function findLikelyFlowThrough(
  transactions: AnnualBankTransaction[],
  internalIncomingIds: Set<number>,
  internalOutgoingIds: Set<number>,
): FlowThroughSuggestion[] {
  const incoming = transactions.filter((item) => item.amount > 0 && !internalIncomingIds.has(item.id));
  const outgoing = transactions.filter((item) => item.amount < 0 && !internalOutgoingIds.has(item.id));
  const usedIncoming = new Set<number>();
  const usedOutgoing = new Set<number>();
  const suggestions: FlowThroughSuggestion[] = [];

  const cents = (value: number) => Math.round(Math.abs(value) * 100);
  const withinWindow = (left: AnnualBankTransaction[], right: AnnualBankTransaction[]) =>
    left.every((a) => right.every((b) => dayDistance(a.date, b.date) <= 2.01));
  const combinedLabel = (items: AnnualBankTransaction[]) => {
    const labels = Array.from(new Set(items.map(counterpartyLabel).filter(Boolean)));
    return labels.length <= 2 ? labels.join(" + ") : `${labels.slice(0, 2).join(" + ")} +${labels.length - 2}`;
  };
  const addSuggestion = (ins: AnnualBankTransaction[], outs: AnnualBankTransaction[]) => {
    const incomingAmount = ins.reduce((sum, item) => sum + item.amount, 0);
    const outgoingAmount = Math.abs(outs.reduce((sum, item) => sum + item.amount, 0));
    if (cents(incomingAmount) !== cents(outgoingAmount)) return;
    const incomingDate = new Date(Math.max(...ins.map((item) => item.date.getTime())));
    const outgoingDate = new Date(Math.min(...outs.map((item) => item.date.getTime())));
    suggestions.push({
      incomingId: ins[0].id,
      outgoingId: outs[0].id,
      incomingIds: ins.map((item) => item.id),
      outgoingIds: outs.map((item) => item.id),
      bankAccountId: ins[0].bankAccountId,
      amount: incomingAmount,
      incomingDate,
      outgoingDate,
      dayDistance: dayDistance(incomingDate, outgoingDate),
      incomingLabel: combinedLabel(ins),
      outgoingLabel: combinedLabel(outs),
    });
    ins.forEach((item) => usedIncoming.add(item.id));
    outs.forEach((item) => usedOutgoing.add(item.id));
  };

  // First preserve the old conservative 1:1 rule: exact amount, same own
  // account, within two days, and unique on both sides.
  const oneToOneCandidates = new Map<number, AnnualBankTransaction[]>();
  for (const item of incoming) {
    const matches = outgoing.filter((candidate) =>
      candidate.bankAccountId === item.bankAccountId &&
      cents(candidate.amount) === cents(item.amount) &&
      dayDistance(candidate.date, item.date) <= 2.01
    );
    if (matches.length === 1) oneToOneCandidates.set(item.id, matches);
  }
  const outgoingUses = new Map<number, number>();
  for (const matches of oneToOneCandidates.values()) {
    outgoingUses.set(matches[0].id, (outgoingUses.get(matches[0].id) ?? 0) + 1);
  }
  for (const item of incoming) {
    const match = oneToOneCandidates.get(item.id)?.[0];
    if (!match || (outgoingUses.get(match.id) ?? 0) !== 1) continue;
    addSuggestion([item], [match]);
  }

  type ComboCandidate = { ins: AnnualBankTransaction[]; outs: AnnualBankTransaction[] };
  const comboKey = (items: AnnualBankTransaction[]) => items.map((item) => item.id).sort((a, b) => a - b).join(",");
  const combinations = (items: AnnualBankTransaction[], size: number) => {
    const result: AnnualBankTransaction[][] = [];
    const walk = (from: number, chosen: AnnualBankTransaction[]) => {
      if (chosen.length === size) { result.push(chosen.slice()); return; }
      for (let i = from; i <= items.length - (size - chosen.length); i += 1) {
        chosen.push(items[i]); walk(i + 1, chosen); chosen.pop();
      }
    };
    walk(0, []);
    return result;
  };

  // Then look for a small, exact many-to-one / one-to-many bridge. We cap the
  // combination at three rows and only accept a candidate when the exact set is
  // unique. This catches e.g. 75,000 + 75,000 -> 150,000 without turning the
  // bank analysis into a general subset-sum guesser.
  const findUniqueCombos = (manySide: "incoming" | "outgoing") => {
    const manyPool = (manySide === "incoming" ? incoming : outgoing).filter((item) =>
      manySide === "incoming" ? !usedIncoming.has(item.id) : !usedOutgoing.has(item.id)
    );
    const singlePool = (manySide === "incoming" ? outgoing : incoming).filter((item) =>
      manySide === "incoming" ? !usedOutgoing.has(item.id) : !usedIncoming.has(item.id)
    );
    const candidates: ComboCandidate[] = [];

    for (const single of singlePool) {
      const nearby = manyPool.filter((item) =>
        item.bankAccountId === single.bankAccountId && dayDistance(item.date, single.date) <= 2.01
      );
      const matches: AnnualBankTransaction[][] = [];
      for (const size of [2, 3]) {
        for (const combo of combinations(nearby, size)) {
          if (!withinWindow(combo, [single])) continue;
          if (combo.reduce((sum, item) => sum + cents(item.amount), 0) === cents(single.amount)) matches.push(combo);
        }
      }
      // More than one exact combination is ambiguous, so leave it unmatched.
      if (matches.length !== 1) continue;
      candidates.push(manySide === "incoming"
        ? { ins: matches[0], outs: [single] }
        : { ins: [single], outs: matches[0] });
    }

    // A row may not participate in two different accepted combinations.
    const rowUses = new Map<string, number>();
    for (const candidate of candidates) {
      for (const item of [...candidate.ins, ...candidate.outs]) {
        const key = `${item.amount > 0 ? "i" : "o"}:${item.id}`;
        rowUses.set(key, (rowUses.get(key) ?? 0) + 1);
      }
    }
    const accepted = candidates.filter((candidate) =>
      [...candidate.ins, ...candidate.outs].every((item) =>
        (rowUses.get(`${item.amount > 0 ? "i" : "o"}:${item.id}`) ?? 0) === 1
      )
    );
    const seen = new Set<string>();
    for (const candidate of accepted) {
      if (candidate.ins.some((item) => usedIncoming.has(item.id)) || candidate.outs.some((item) => usedOutgoing.has(item.id))) continue;
      const key = `${comboKey(candidate.ins)}->${comboKey(candidate.outs)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      addSuggestion(candidate.ins, candidate.outs);
    }
  };

  findUniqueCombos("incoming");
  findUniqueCombos("outgoing");

  return suggestions.sort((a, b) => b.amount - a.amount || a.incomingDate.getTime() - b.incomingDate.getTime());
}

export function buildAnnualBankAnalysis(transactions: AnnualBankTransaction[]) {
  const internalPairs = findLikelyInternalTransfers(transactions);
  const internalIncomingIds = new Set(internalPairs.map((pair) => pair.incomingId));
  const internalOutgoingIds = new Set(internalPairs.map((pair) => pair.outgoingId));

  const analyzed = transactions.map((transaction) => ({
    transaction,
    result: analyzeBankTransaction({
      text: transaction.text,
      amount: transaction.amount,
      sourceRawData: transaction.sourceRawData,
    }),
  }));

  const grossInflows = transactions.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
  const grossOutflows = Math.abs(transactions.filter((item) => item.amount < 0).reduce((sum, item) => sum + item.amount, 0));
  const netCashFlow = transactions.reduce((sum, item) => sum + item.amount, 0);

  const interestIncome = analyzed
    .filter((item) => item.transaction.amount > 0 && item.result.kind === "INTEREST_INCOME")
    .reduce((sum, item) => sum + item.transaction.amount, 0);

  const likelyInternalInflows = internalPairs.reduce((sum, pair) => sum + pair.amount, 0);
  const likelyInternalOutflows = likelyInternalInflows;

  const inflowStillToClassify = Math.max(0, grossInflows - likelyInternalInflows - interestIncome);

  const candidateIncomeGroups = new Map<string, { key: string; label: string; count: number; amount: number; transactionIds: number[] }>();
  for (const item of analyzed) {
    const tx = item.transaction;
    if (tx.amount <= 0 || internalIncomingIds.has(tx.id) || item.result.kind === "INTEREST_INCOME") continue;
    const raw = parseRawBankData(tx.sourceRawData);
    const key = buildPatternKey(tx.text, raw) ?? `text:${tx.text}`;
    const current: { key: string; label: string; count: number; amount: number; transactionIds: number[] } = candidateIncomeGroups.get(key) ?? {
      key,
      label: counterpartyLabel(tx),
      count: 0,
      amount: 0,
      transactionIds: [],
    };
    current.count += 1;
    current.amount += tx.amount;
    current.transactionIds.push(tx.id);
    candidateIncomeGroups.set(key, current);
  }

  const classifiedIncomeGroups: ClassifiedIncomeGroup[] = Array.from(candidateIncomeGroups.values())
    .map((group) => {
      const groupTransactions = analyzed
        .filter((item) => item.result.kind !== "INTEREST_INCOME")
        .map((item) => item.transaction)
        .filter((tx) => {
          if (tx.amount <= 0 || internalIncomingIds.has(tx.id)) return false;
          const raw = parseRawBankData(tx.sourceRawData);
          const key = buildPatternKey(tx.text, raw) ?? `text:${tx.text}`;
          return key === group.key;
        });

      // Classify each incoming row before summarising the counterparty group.
      // One strongly worded grant/refund/settlement row must not reclassify every
      // other payment from the same payer. This mirrors the conservative expense
      // analysis and keeps the evidence attached to the transaction that carries it.
      const perTransaction = groupTransactions.map((tx) => classifyIncomeTransactions([tx]));
      const referencePattern = detectRepeatedReferencePattern(groupTransactions);
      const first = perTransaction[0];
      const sameClassification = Boolean(first) && perTransaction.every(
        (item) => item.classification === first.classification,
      );

      if (!first || !sameClassification) {
        return {
          ...group,
          classification: "UNKNOWN" as const,
          confidence: "LOW" as const,
          evidence: "mixed-transaction-evidence",
          referencePattern,
        };
      }

      const confidenceRank: Record<IncomeConfidence, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
      const confidence = perTransaction.reduce<IncomeConfidence>(
        (lowest, item) => confidenceRank[item.confidence] < confidenceRank[lowest] ? item.confidence : lowest,
        first.confidence,
      );
      return {
        ...group,
        classification: first.classification,
        confidence,
        evidence: perTransaction.every((item) => item.evidence === first.evidence)
          ? first.evidence
          : "shared-income-evidence",
        referencePattern,
      };
    })
    .sort((a, b) => b.amount - a.amount || b.count - a.count);

  // Totals are transaction-based rather than group-based. A mixed counterparty
  // can therefore contribute its clearly evidenced rows to the right bucket while
  // genuinely unclear rows remain UNKNOWN. This lets deterministic evidence reduce
  // the unclassified inflow without contaminating the rest of the payer group.
  const classificationTotals = analyzed
    .filter((item) => item.transaction.amount > 0)
    .filter((item) => !internalIncomingIds.has(item.transaction.id))
    .filter((item) => item.result.kind !== "INTEREST_INCOME")
    .reduce<Record<IncomeClassification, number>>(
    (totals, item) => {
      const classified = classifyIncomeTransactions([item.transaction]);
      totals[classified.classification] += item.transaction.amount;
      return totals;
    },
    {
      OPERATING_REVENUE: 0,
      GRANT_CONTRIBUTION: 0,
      PAYMENT_SETTLEMENT: 0,
      LOAN_CAPITAL: 0,
      REFUND: 0,
      OTHER: 0,
      UNKNOWN: 0,
    }
  );

  const likelyTurnover = classificationTotals.OPERATING_REVENUE + classificationTotals.PAYMENT_SETTLEMENT;
  const confirmedTurnover = analyzed
    .filter((item) => item.transaction.amount > 0)
    .filter((item) => !internalIncomingIds.has(item.transaction.id))
    .filter((item) => item.result.kind !== "INTEREST_INCOME")
    .reduce((sum, item) => {
      const classified = classifyIncomeTransactions([item.transaction]);
      return classified.classification === "OPERATING_REVENUE" && classified.confidence === "HIGH"
        ? sum + item.transaction.amount
        : sum;
    }, 0);

  const analyzedKinds = new Map(analyzed.map((item) => [item.transaction.id, item.result.kind]));
  const candidateExpenseGroups = new Map<string, {
    key: string;
    label: string;
    count: number;
    amount: number;
    transactionIds: number[];
  }>();

  for (const item of analyzed) {
    const tx = item.transaction;
    if (tx.amount >= 0 || internalOutgoingIds.has(tx.id)) continue;
    const raw = parseRawBankData(tx.sourceRawData);
    const key = buildPatternKey(tx.text, raw) ?? `text:${tx.text}`;
    const current: { key: string; label: string; count: number; amount: number; transactionIds: number[] } = candidateExpenseGroups.get(key) ?? {
      key,
      label: counterpartyLabel(tx),
      count: 0,
      amount: 0,
      transactionIds: [],
    };
    current.count += 1;
    current.amount += Math.abs(tx.amount);
    current.transactionIds.push(tx.id);
    candidateExpenseGroups.set(key, current);
  }

  const classifiedExpenseGroups: ClassifiedExpenseGroup[] = Array.from(candidateExpenseGroups.values())
    .map((group) => {
      const groupTransactions = transactions.filter((tx) => group.transactionIds.includes(tx.id));
      return { ...group, ...classifyExpenseGroup(groupTransactions, analyzedKinds) };
    })
    .sort((a, b) => b.amount - a.amount || b.count - a.count);

  const expenseClassificationTotals = classifiedExpenseGroups.reduce<Record<ExpenseClassification, number>>(
    (totals, group) => {
      for (const item of group.breakdown) totals[item.classification] += item.amount;
      return totals;
    },
    {
      OPERATING_EXPENSE: 0,
      PREMISES: 0,
      UTILITIES: 0,
      TELECOM: 0,
      SOFTWARE: 0,
      INSURANCE: 0,
      VEHICLE: 0,
      TRAVEL: 0,
      ADVERTISING: 0,
      TRANSPORT: 0,
      GOODS_SERVICES: 0,
      DINING: 0,
      GROCERY_PURCHASE: 0,
      OFFICE_SUPPLIES: 0,
      RESALE_GOODS: 0,
      EVENT_HOSPITALITY: 0,
      SPORTS_EVENT: 0,
      SPORTS_EQUIPMENT: 0,
      TELECOM_EQUIPMENT: 0,
      POS_PAYMENT_SERVICE: 0,
      ADMIN_REGISTRATION_FEE: 0,
      RELATED_ENTITY_FLOW: 0,
      GRANT: 0,
      CONTRIBUTION: 0,
      COST_ALLOWANCE: 0,
      WAGES: 0,
      PAYROLL_RELATED: 0,
      PERSON_PAYMENT: 0,
      BANK_FEE: 0,
      CASH_WITHDRAWAL: 0,
      ASSET_INVESTMENT: 0,
      LOAN_CAPITAL: 0,
      REFUND: 0,
      TAX_FINANCIAL: 0,
      OTHER: 0,
      MIXED: 0,
      UNKNOWN: 0,
    }
  );

  expenseClassificationTotals.OPERATING_EXPENSE =
    expenseClassificationTotals.PREMISES +
    expenseClassificationTotals.UTILITIES +
    expenseClassificationTotals.TELECOM +
    expenseClassificationTotals.SOFTWARE +
    expenseClassificationTotals.INSURANCE +
    expenseClassificationTotals.VEHICLE +
    expenseClassificationTotals.TRAVEL +
    expenseClassificationTotals.ADVERTISING +
    expenseClassificationTotals.TRANSPORT +
    expenseClassificationTotals.GOODS_SERVICES +
    expenseClassificationTotals.DINING +
    expenseClassificationTotals.GROCERY_PURCHASE +
    expenseClassificationTotals.OFFICE_SUPPLIES +
    expenseClassificationTotals.RESALE_GOODS +
    expenseClassificationTotals.EVENT_HOSPITALITY +
    expenseClassificationTotals.SPORTS_EVENT +
    expenseClassificationTotals.SPORTS_EQUIPMENT +
    expenseClassificationTotals.TELECOM_EQUIPMENT +
    expenseClassificationTotals.POS_PAYMENT_SERVICE +
    expenseClassificationTotals.ADMIN_REGISTRATION_FEE;

  const outflowStillToClassify = expenseClassificationTotals.UNKNOWN;

  const recurringExpensePatterns = classifiedExpenseGroups
    .map((group) => detectRecurringMonthlyPattern(
      group.key,
      group.label,
      transactions.filter((tx) => group.transactionIds.includes(tx.id)),
    ))
    .filter((item): item is RecurringExpensePattern => Boolean(item))
    .sort((a, b) => b.amount - a.amount || b.monthCount - a.monthCount);

  const flowThroughSuggestions = findLikelyFlowThrough(transactions, internalIncomingIds, internalOutgoingIds);

  return {
    transactionCount: transactions.length,
    grossInflows,
    grossOutflows,
    netCashFlow,
    interestIncome,
    likelyInternalInflows,
    likelyInternalOutflows,
    inflowStillToClassify,
    internalPairs,
    internalIncomingIds,
    internalOutgoingIds,
    incomeGroups: Array.from(candidateIncomeGroups.values())
      .sort((a, b) => b.amount - a.amount || b.count - a.count),
    classifiedIncomeGroups,
    classificationTotals,
    likelyTurnover,
    confirmedTurnover,
    classifiedExpenseGroups,
    expenseClassificationTotals,
    outflowStillToClassify,
    recurringExpensePatterns,
    flowThroughSuggestions,
  };
}

export type AccountFlowGroup = {
  key: string;
  label: string;
  count: number;
  amount: number;
  transactionIds: number[];
};

export type AccountBankAnalysis = {
  bankAccountId: number;
  transactionCount: number;
  inflows: number;
  outflows: number;
  netCashFlow: number;
  internalInflows: number;
  internalOutflows: number;
  externalInflows: number;
  externalOutflows: number;
  incomingGroups: AccountFlowGroup[];
  outgoingGroups: AccountFlowGroup[];
  recurringPatterns: RecurringExpensePattern[];
};

/**
 * Builds a neutral per-account cash-flow summary from the same annual data.
 * Own-account transfers are shown separately so they do not obscure external
 * sources and destinations. No accounting classification or AI is performed.
 */
export function buildAccountBankAnalysis(
  transactions: AnnualBankTransaction[],
  bankAccountId: number,
): AccountBankAnalysis {
  const annual = buildAnnualBankAnalysis(transactions);
  const accountTransactions = transactions.filter((tx) => tx.bankAccountId === bankAccountId);
  const internalIncomingIds = annual.internalIncomingIds;
  const internalOutgoingIds = annual.internalOutgoingIds;

  const groupTransactions = (direction: "in" | "out") => {
    const groups = new Map<string, AccountFlowGroup>();

    for (const tx of accountTransactions) {
      if (direction === "in" && (tx.amount <= 0 || internalIncomingIds.has(tx.id))) continue;
      if (direction === "out" && (tx.amount >= 0 || internalOutgoingIds.has(tx.id))) continue;

      const raw = parseRawBankData(tx.sourceRawData);
      const key = buildPatternKey(tx.text, raw) ?? `text:${tx.text}`;
      const current = groups.get(key) ?? {
        key,
        label: counterpartyLabel(tx),
        count: 0,
        amount: 0,
        transactionIds: [],
      };
      current.count += 1;
      current.amount += Math.abs(tx.amount);
      current.transactionIds.push(tx.id);
      groups.set(key, current);
    }

    return Array.from(groups.values()).sort((a, b) => b.amount - a.amount || b.count - a.count);
  };

  const inflows = accountTransactions
    .filter((tx) => tx.amount > 0)
    .reduce((sum, tx) => sum + tx.amount, 0);
  const outflows = Math.abs(accountTransactions
    .filter((tx) => tx.amount < 0)
    .reduce((sum, tx) => sum + tx.amount, 0));
  const internalInflows = annual.internalPairs
    .filter((pair) => pair.incomingAccountId === bankAccountId)
    .reduce((sum, pair) => sum + pair.amount, 0);
  const internalOutflows = annual.internalPairs
    .filter((pair) => pair.outgoingAccountId === bankAccountId)
    .reduce((sum, pair) => sum + pair.amount, 0);

  const outgoingGroups = groupTransactions("out");
  const recurringPatterns = outgoingGroups
    .map((group) => detectRecurringMonthlyPattern(
      group.key,
      group.label,
      accountTransactions.filter((tx) => group.transactionIds.includes(tx.id)),
    ))
    .filter((item): item is RecurringExpensePattern => Boolean(item))
    .sort((a, b) => b.amount - a.amount || b.monthCount - a.monthCount);

  return {
    bankAccountId,
    transactionCount: accountTransactions.length,
    inflows,
    outflows,
    netCashFlow: inflows - outflows,
    internalInflows,
    internalOutflows,
    externalInflows: Math.max(0, inflows - internalInflows),
    externalOutflows: Math.max(0, outflows - internalOutflows),
    incomingGroups: groupTransactions("in"),
    outgoingGroups,
    recurringPatterns,
  };
}
