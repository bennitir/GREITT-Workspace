import {
  canonicalizeInsightIdentifier,
} from "@/lib/insight/entity-identity";

export type CanonicalReceiptBookingEntry = {
  account: string;
  text: string;
  debit: number;
  credit: number;
  entryRole: string | null;
};

export type CanonicalInsurancePolicyFact = {
  policyNumber: string;
  amount: number | null;
};

export type CanonicalReceiptKnowledge = {
  loanInfo: Record<string, unknown> | null;
  insuranceInfo: Record<string, unknown> | null;
  insurancePolicies: CanonicalInsurancePolicyFact[];
  bookingEntries: CanonicalReceiptBookingEntry[];
  hasCanonicalLoan: boolean;
  hasCanonicalInsurance: boolean;
  hasCanonicalBookingEntries: boolean;
};

export type ReceiptKnowledgeBlocker =
  | "NO_DOCUMENTS"
  | "NO_CANONICAL_FACTS"
  | "UNCONFIRMED_ENTITY"
  | "MISSING_ENTITY_LINK"
  | "AMBIGUOUS_ENTITY"
  | "MISSING_ACCOUNT_MAPPING"
  | "MISSING_ACCOUNT"
  | "INVALID_BOOKING_ENTRY"
  | "UNBALANCED_BOOKING"
  | "UNSAFE_REVIEW_STATE";

export type ReceiptKnowledgeReconciliationResult = {
  status: "RECONCILED" | "NEEDS_AI" | "NO_CHANGE";
  receiptId: number;
  documentIds: number[];
  reconciledDocumentIds: number[];
  blockers: ReceiptKnowledgeBlocker[];
  reason: string;
  aiFallbackRecommended: boolean;
};

export type ReconciliationAccount = {
  number: string;
  companyId: number;
  isActive: boolean;
};

export type ReconciliationEntityKnowledge = {
  role: string;
  entity: {
    id: number;
    entityType: string;
    identifierType: string | null;
    identifierValue: string | null;
    relationshipStatus: string | null;
    accountLinks: Array<{
      role: string;
      status: string;
      account: ReconciliationAccount;
    }>;
  };
};

export type ReconciliationDocument = {
  id: number;
  documentRole: string | null;
  summary: string;
  totalAmount: number | null;
  environmentReviewRequired: boolean;
  environmentConfirmedAt: Date | null;
  extractionMetadata: unknown;
  entityLinks: ReconciliationEntityKnowledge[];
};

export type PureReconciliationResult = {
  status: "RECONCILED" | "NEEDS_AI" | "NO_CHANGE";
  bookingEntries: CanonicalReceiptBookingEntry[];
  blockers: ReceiptKnowledgeBlocker[];
  reason: string;
  canPromoteToBookable: boolean;
  appliedKnowledge: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeBookingEntry(value: unknown): CanonicalReceiptBookingEntry | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const account = asNonEmptyString(raw.account);
  const text = asNonEmptyString(raw.text) ?? "Bókunarlína";
  const debit = asFiniteNumber(raw.debit);
  const credit = asFiniteNumber(raw.credit);
  const entryRole = asNonEmptyString(raw.entryRole);

  if (!account || debit === null || credit === null) return null;
  if (debit < 0 || credit < 0) return null;
  if (debit === 0 && credit === 0) return null;
  if (debit > 0 && credit > 0) return null;

  return {
    account,
    text,
    debit,
    credit,
    entryRole,
  };
}

function normalizeInsurancePolicy(value: unknown): CanonicalInsurancePolicyFact | null {
  const raw = asRecord(value);
  if (!raw) return null;

  const policyNumber = asNonEmptyString(raw.policyNumber);
  if (!policyNumber) return null;

  const amount = asFiniteNumber(raw.amount);

  return {
    policyNumber,
    amount: amount !== null && amount > 0 ? amount : null,
  };
}

export function inspectCanonicalReceiptKnowledge(
  extractionMetadata: unknown,
): CanonicalReceiptKnowledge {
  const metadata = asRecord(extractionMetadata);
  const canonicalExtraction = asRecord(metadata?.canonicalExtraction);
  const loanInfo = asRecord(canonicalExtraction?.loanInfo);
  const insuranceInfo = asRecord(canonicalExtraction?.insuranceInfo);
  const insurancePolicies = Array.isArray(canonicalExtraction?.insurancePolicies)
    ? canonicalExtraction.insurancePolicies
        .map(normalizeInsurancePolicy)
        .filter((item): item is CanonicalInsurancePolicyFact => Boolean(item))
    : [];
  const bookingEntries = Array.isArray(canonicalExtraction?.bookingEntries)
    ? canonicalExtraction.bookingEntries
        .map(normalizeBookingEntry)
        .filter((item): item is CanonicalReceiptBookingEntry => Boolean(item))
    : [];

  return {
    loanInfo,
    insuranceInfo,
    insurancePolicies,
    bookingEntries,
    hasCanonicalLoan: Boolean(loanInfo),
    hasCanonicalInsurance: Boolean(insuranceInfo) || insurancePolicies.length > 0,
    hasCanonicalBookingEntries: bookingEntries.length > 0,
  };
}

export function hasReusableCanonicalReceiptFacts(extractionMetadata: unknown) {
  const knowledge = inspectCanonicalReceiptKnowledge(extractionMetadata);
  return (
    knowledge.hasCanonicalLoan ||
    knowledge.hasCanonicalInsurance ||
    knowledge.hasCanonicalBookingEntries
  );
}

function normalizeIdentifierForText(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function textContainsIdentifier(text: string, identifierValue: string | null) {
  if (!identifierValue) return false;
  const needle = normalizeIdentifierForText(identifierValue);
  if (!needle) return false;
  return normalizeIdentifierForText(text).includes(needle);
}

function getConfirmedAccountNumber(
  knowledge: ReconciliationEntityKnowledge,
  accountRole: string,
  companyId: number,
) {
  if (knowledge.entity.relationshipStatus !== "CONFIRMED") return null;

  const candidates = knowledge.entity.accountLinks.filter(
    (link) =>
      link.role === accountRole &&
      link.status === "CONFIRMED" &&
      link.account.companyId === companyId &&
      link.account.isActive,
  );

  if (candidates.length !== 1) return null;
  return candidates[0].account.number;
}

function selectLinkedEntityForEntry(
  links: ReconciliationEntityKnowledge[],
  entityType: string,
  entryText: string,
) {
  const matchingType = links.filter(
    (link) => link.entity.entityType === entityType,
  );

  if (matchingType.length <= 1) return matchingType;

  const exactTextMatches = matchingType.filter((link) =>
    textContainsIdentifier(entryText, link.entity.identifierValue),
  );

  return exactTextMatches.length > 0 ? exactTextMatches : matchingType;
}

function findInsuranceLinkForPolicy(
  links: ReconciliationEntityKnowledge[],
  policyNumber: string,
) {
  const wanted = canonicalizeInsightIdentifier({
    entityType: "INSURANCE_POLICY",
    identifierType: "POLICY_NUMBER",
    identifierValue: policyNumber,
  });

  return links.filter((link) => {
    if (link.entity.entityType !== "INSURANCE_POLICY") return false;

    const candidate = canonicalizeInsightIdentifier({
      entityType: link.entity.entityType,
      identifierType: link.entity.identifierType,
      identifierValue: link.entity.identifierValue,
    });

    return (
      candidate.identifierType === wanted.identifierType &&
      candidate.identifierValue === wanted.identifierValue
    );
  });
}

function dedupeBlockers(blockers: ReceiptKnowledgeBlocker[]) {
  return [...new Set(blockers)];
}

function hasKnownMappingReview(summary: string) {
  const normalized = summary.toLocaleLowerCase("is-IS");
  return (
    normalized.includes("tryggingarskírteinum þurfa staðfest") ||
    normalized.includes("staðfestu skuldareikning lánsins") ||
    normalized.includes("lánshöfuðstóll fannst en lánsnúmer") ||
    normalized.includes("hefur ekki staðfesta tengingu við skuldareikning")
  );
}

export function reconcileDocumentFromKnownFacts(input: {
  companyId: number;
  document: ReconciliationDocument;
  activeAccounts: Map<string, ReconciliationAccount>;
}): PureReconciliationResult {
  const { companyId, document, activeAccounts } = input;
  const canonical = inspectCanonicalReceiptKnowledge(document.extractionMetadata);
  const blockers: ReceiptKnowledgeBlocker[] = [];
  const appliedKnowledge: string[] = [];

  if (
    !canonical.hasCanonicalLoan &&
    !canonical.hasCanonicalInsurance &&
    !canonical.hasCanonicalBookingEntries
  ) {
    return {
      status: "NO_CHANGE",
      bookingEntries: [],
      blockers: ["NO_CANONICAL_FACTS"],
      reason: "Engar canonical staðreyndir voru til til öruggrar endurútreikningar.",
      canPromoteToBookable: false,
      appliedKnowledge,
    };
  }

  if (canonical.hasCanonicalInsurance) {
    for (const policy of canonical.insurancePolicies) {
      const links = findInsuranceLinkForPolicy(
        document.entityLinks,
        policy.policyNumber,
      );

      if (links.length !== 1) {
        blockers.push(links.length === 0 ? "MISSING_ENTITY_LINK" : "AMBIGUOUS_ENTITY");
        continue;
      }

      const accountNumber = getConfirmedAccountNumber(
        links[0],
        "EXPENSE",
        companyId,
      );

      if (!accountNumber) {
        blockers.push(
          links[0].entity.relationshipStatus === "CONFIRMED"
            ? "MISSING_ACCOUNT_MAPPING"
            : "UNCONFIRMED_ENTITY",
        );
        continue;
      }

      appliedKnowledge.push(
        `INSURANCE_POLICY:${policy.policyNumber}->${accountNumber}`,
      );
    }
  }

  if (canonical.hasCanonicalLoan) {
    const loanLinks = document.entityLinks.filter(
      (link) => link.entity.entityType === "LOAN",
    );

    if (loanLinks.length === 0) {
      blockers.push("MISSING_ENTITY_LINK");
    } else if (loanLinks.every((link) => link.entity.relationshipStatus !== "CONFIRMED")) {
      blockers.push("UNCONFIRMED_ENTITY");
    }
  }

  if (blockers.length > 0) {
    return {
      status: "NEEDS_AI",
      bookingEntries: [],
      blockers: dedupeBlockers(blockers),
      reason: "Staðfest þekking dugar ekki enn til að endurmeta skjalið án ágiskunar.",
      canPromoteToBookable: false,
      appliedKnowledge,
    };
  }

  if (!canonical.hasCanonicalBookingEntries) {
    return {
      status: "NEEDS_AI",
      bookingEntries: [],
      blockers: ["NO_CANONICAL_FACTS"],
      reason: "Canonical bókunarlínur vantar; GLÖGGT giskar ekki á mótreikning eða fjárhæðir.",
      canPromoteToBookable: false,
      appliedKnowledge,
    };
  }

  const reconciledEntries: CanonicalReceiptBookingEntry[] = [];

  for (const entry of canonical.bookingEntries) {
    let accountNumber = entry.account;

    if (entry.entryRole === "LOAN_PRINCIPAL") {
      const loanLinks = selectLinkedEntityForEntry(
        document.entityLinks,
        "LOAN",
        entry.text,
      );

      if (loanLinks.length !== 1) {
        blockers.push(loanLinks.length === 0 ? "MISSING_ENTITY_LINK" : "AMBIGUOUS_ENTITY");
        continue;
      }

      const confirmedAccount = getConfirmedAccountNumber(
        loanLinks[0],
        "LIABILITY_PRINCIPAL",
        companyId,
      );

      if (!confirmedAccount) {
        blockers.push("MISSING_ACCOUNT_MAPPING");
        continue;
      }

      accountNumber = confirmedAccount;
      appliedKnowledge.push(
        `LOAN:${loanLinks[0].entity.identifierValue ?? loanLinks[0].entity.id}->${accountNumber}`,
      );
    } else if (entry.debit > 0 && canonical.insurancePolicies.length > 0) {
      let matchingPolicies = canonical.insurancePolicies.filter((policy) =>
        textContainsIdentifier(entry.text, policy.policyNumber),
      );

      // Ein-skírteinisgreiðslur geta haft lýsingu án skírteinisnúmers í
      // bookingEntry þótt canonical insurancePolicies hafi sterka auðkennið.
      // Þá má para eingöngu ef fjárhæðin stemmir við eina skírteinisupphæð.
      if (matchingPolicies.length === 0 && canonical.insurancePolicies.length === 1) {
        const onlyPolicy = canonical.insurancePolicies[0];
        if (onlyPolicy.amount !== null && Math.abs(onlyPolicy.amount - entry.debit) <= 0.01) {
          matchingPolicies = [onlyPolicy];
        }
      }

      if (matchingPolicies.length === 1) {
        const links = findInsuranceLinkForPolicy(
          document.entityLinks,
          matchingPolicies[0].policyNumber,
        );

        if (links.length !== 1) {
          blockers.push(links.length === 0 ? "MISSING_ENTITY_LINK" : "AMBIGUOUS_ENTITY");
          continue;
        }

        const confirmedAccount = getConfirmedAccountNumber(
          links[0],
          "EXPENSE",
          companyId,
        );

        if (!confirmedAccount) {
          blockers.push("MISSING_ACCOUNT_MAPPING");
          continue;
        }

        accountNumber = confirmedAccount;
      } else if (matchingPolicies.length > 1) {
        blockers.push("AMBIGUOUS_ENTITY");
        continue;
      } else {
        // Við varðveitum aðeins óparaða debetlínu í tryggingaskjali ef textinn
        // sýnir skýrt að um aukagjald/kostnað sé að ræða. Annars gæti AI-lína
        // verið rangt flokkuð trygging og við föllum frekar aftur í AI.
        const normalizedText = entry.text.toLocaleLowerCase("is-IS");
        const looksLikeAncillaryCharge =
          normalizedText.includes("gjald") ||
          normalizedText.includes("kostnað") ||
          normalizedText.includes("dreifing");

        if (!looksLikeAncillaryCharge) {
          blockers.push("AMBIGUOUS_ENTITY");
          continue;
        }
      }
    }

    const account = activeAccounts.get(accountNumber);
    if (!account || !account.isActive || account.companyId !== companyId) {
      blockers.push("MISSING_ACCOUNT");
      continue;
    }

    reconciledEntries.push({
      ...entry,
      account: accountNumber,
    });
  }

  if (blockers.length > 0 || reconciledEntries.length !== canonical.bookingEntries.length) {
    return {
      status: "NEEDS_AI",
      bookingEntries: [],
      blockers: dedupeBlockers(
        blockers.length > 0 ? blockers : ["INVALID_BOOKING_ENTRY"],
      ),
      reason: "Ekki tókst að staðfesta allar canonical bókunarlínur gegn núverandi þekkingu.",
      canPromoteToBookable: false,
      appliedKnowledge,
    };
  }

  const debitTotal = reconciledEntries.reduce((sum, entry) => sum + entry.debit, 0);
  const creditTotal = reconciledEntries.reduce((sum, entry) => sum + entry.credit, 0);

  if (Math.abs(debitTotal - creditTotal) > 0.01 || debitTotal <= 0) {
    return {
      status: "NEEDS_AI",
      bookingEntries: [],
      blockers: ["UNBALANCED_BOOKING"],
      reason: "Canonical bókunin stemmir ekki eftir að staðfest þekking var sett inn.",
      canPromoteToBookable: false,
      appliedKnowledge,
    };
  }

  const currentRole = document.documentRole ?? "REVIEW";
  const promoteFromReview =
    currentRole === "REVIEW" &&
    hasKnownMappingReview(document.summary);
  const canPromoteToBookable =
    currentRole === "BOOKABLE" || promoteFromReview;

  if (!canPromoteToBookable) {
    return {
      status: "NEEDS_AI",
      bookingEntries: [],
      blockers: ["UNSAFE_REVIEW_STATE"],
      reason: "Bókunin stemmir, en núverandi REVIEW-staða stafar ekki örugglega aðeins af þekkingargati sem var staðfest.",
      canPromoteToBookable: false,
      appliedKnowledge,
    };
  }

  return {
    status: "RECONCILED",
    bookingEntries: reconciledEntries,
    blockers: [],
    reason: "Staðfest þekking og canonical bókunarlínur nægðu; ekkert nýtt AI-kall þurfti.",
    canPromoteToBookable,
    appliedKnowledge,
  };
}
