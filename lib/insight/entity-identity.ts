import type { InsightEntity, Prisma } from "@/app/generated/prisma/client";

export type InsightIdentifierStrength =
  | "STRONG"
  | "EXACT"
  | "WEAK"
  | "NONE";

export type CanonicalInsightIdentifier = {
  entityType: string;
  identifierType: string | null;
  identifierValue: string | null;
  strength: InsightIdentifierStrength;
};

type AliasRegistryEntry = {
  canonicalType: string;
  aliases: readonly string[];
  strength: Exclude<InsightIdentifierStrength, "NONE">;
};

/*
 * Sameiginleg orðabók fyrir sterk rekstrarauðkenni.
 *
 * Þetta er EKKI birgja-/skjalasniðslisti. Hann lýsir aðeins því þegar
 * mismunandi kerfi eða AI-heiti merkja sama tegund auðkennis.
 *
 * Mikilvægt: aðeins STRONG auðkenni mega sameina entity sjálfkrafa yfir
 * alias-heiti. WEAK auðkenni (t.d. síðustu fjórir kortastafir) mega það ekki.
 */
const IDENTIFIER_ALIASES: Record<string, readonly AliasRegistryEntry[]> = {
  INSURANCE_POLICY: [
    {
      canonicalType: "POLICY_NUMBER",
      aliases: ["POLICY_NUMBER", "SKIRTEINISNUMER", "CERTIFICATE_NUMBER"],
      strength: "STRONG",
    },
  ],
  VEHICLE: [
    {
      canonicalType: "REGISTRATION_NUMBER",
      aliases: ["REGISTRATION_NUMBER", "FASTANUMER", "PLATE_NUMBER"],
      strength: "STRONG",
    },
  ],
  BANK_ACCOUNT: [
    {
      canonicalType: "BANK_ACCOUNT_NUMBER",
      aliases: ["BANK_ACCOUNT_NUMBER", "ACCOUNT_NUMBER"],
      strength: "STRONG",
    },
  ],
  METER: [
    {
      canonicalType: "METER_NUMBER",
      aliases: ["METER_NUMBER", "MAELIR"],
      strength: "STRONG",
    },
  ],
  DEBT_INSTRUMENT: [
    {
      canonicalType: "COLLECTION_LETTER_NUMBER",
      aliases: [
        "COLLECTION_LETTER_NUMBER",
        "COLLECTION_NOTICE_NUMBER",
        "INNHEIMTUBREF_NUMER",
      ],
      strength: "STRONG",
    },
  ],
  PAYMENT_CARD: [
    {
      canonicalType: "CARD_LAST_FOUR",
      aliases: ["CARD_LAST_FOUR", "LAST_FOUR_DIGITS", "MASKED_CARD_SUFFIX"],
      strength: "WEAK",
    },
  ],
  ORGANIZATION: [
    {
      canonicalType: "KENNITALA",
      aliases: ["KENNITALA"],
      strength: "STRONG",
    },
  ],
  PERSON: [
    {
      canonicalType: "KENNITALA",
      aliases: ["KENNITALA"],
      strength: "STRONG",
    },
  ],
  LOAN: [
    {
      canonicalType: "LOAN_NUMBER",
      aliases: ["LOAN_NUMBER"],
      strength: "STRONG",
    },
  ],
  PROPERTY: [
    {
      canonicalType: "PROPERTY_NUMBER",
      aliases: ["PROPERTY_NUMBER", "FASTEIGNANUMER"],
      strength: "STRONG",
    },
  ],
  CONTRACT: [
    {
      canonicalType: "CONTRACT_NUMBER",
      aliases: ["CONTRACT_NUMBER", "SAMNINGSNUMER"],
      strength: "STRONG",
    },
  ],
};

function normalizeToken(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase().replace(/[\s-]+/g, "_") ?? "";
  return normalized || null;
}

function normalizeGenericValue(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function normalizeIcelandicBankAccount(value: string) {
  const compact = value.trim().replace(/\s+/g, "");
  const match = compact.match(/^(\d{4})-?(\d{2})-?(\d{1,6})$/);
  if (!match) return normalizeGenericValue(value);
  return `${match[1]}-${match[2]}-${match[3].padStart(6, "0")}`;
}

function normalizeCanonicalValue(
  entityType: string,
  identifierType: string,
  value: string,
) {
  if (identifierType === "KENNITALA") {
    const digits = value.replace(/\D/g, "");
    return /^\d{10}$/.test(digits) ? digits : normalizeGenericValue(value);
  }

  if (identifierType === "REGISTRATION_NUMBER") {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  if (identifierType === "BANK_ACCOUNT_NUMBER" && entityType === "BANK_ACCOUNT") {
    return normalizeIcelandicBankAccount(value);
  }

  if (identifierType === "CARD_LAST_FOUR") {
    const digits = value.replace(/\D/g, "");
    return /^\d{4}$/.test(digits) ? digits : normalizeGenericValue(value);
  }

  return normalizeGenericValue(value);
}

function findAliasEntry(entityType: string, identifierType: string) {
  const entries = IDENTIFIER_ALIASES[entityType] ?? [];
  return entries.find((entry) => entry.aliases.includes(identifierType)) ?? null;
}

export function getCanonicalIdentifierAliases(
  entityTypeInput: string,
  canonicalTypeInput: string,
) {
  const entityType = normalizeToken(entityTypeInput) ?? entityTypeInput;
  const canonicalType = normalizeToken(canonicalTypeInput) ?? canonicalTypeInput;
  const entry = (IDENTIFIER_ALIASES[entityType] ?? []).find(
    (item) => item.canonicalType === canonicalType,
  );
  return entry ? [...entry.aliases] : [canonicalType];
}

export function canonicalizeInsightIdentifier(input: {
  entityType: string;
  identifierType: string | null;
  identifierValue: string | null;
}): CanonicalInsightIdentifier {
  const entityType = normalizeToken(input.entityType) ?? input.entityType.trim();
  const rawType = normalizeToken(input.identifierType);
  const rawValue = input.identifierValue?.trim() || null;

  if (!rawType || !rawValue) {
    return {
      entityType,
      identifierType: rawType,
      identifierValue: rawValue,
      strength: "NONE",
    };
  }

  const alias = findAliasEntry(entityType, rawType);
  const identifierType = alias?.canonicalType ?? rawType;
  const strength = alias?.strength ?? "EXACT";

  return {
    entityType,
    identifierType,
    identifierValue: normalizeCanonicalValue(entityType, identifierType, rawValue),
    strength,
  };
}

function normalizeEntityName(name: string) {
  return name.trim().toLocaleLowerCase("is-IS").replace(/\s+/g, " ");
}

function choosePreferredCandidate(
  candidates: InsightEntity[],
  canonicalType: string | null,
) {
  return [...candidates].sort((a, b) => {
    const confirmedDiff =
      Number(b.relationshipStatus === "CONFIRMED") -
      Number(a.relationshipStatus === "CONFIRMED");
    if (confirmedDiff !== 0) return confirmedDiff;

    const canonicalDiff =
      Number(normalizeToken(b.identifierType) === canonicalType) -
      Number(normalizeToken(a.identifierType) === canonicalType);
    if (canonicalDiff !== 0) return canonicalDiff;

    return a.id - b.id;
  })[0] ?? null;
}

export async function resolveCanonicalInsightEntity(
  tx: Prisma.TransactionClient,
  input: {
    companyId: number;
    entityType: string;
    name: string;
    identifierType: string | null;
    identifierValue: string | null;
    relationshipStatus?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<{
  entity: InsightEntity;
  created: boolean;
  matchedBy: "IDENTIFIER" | "NAME" | "CREATED";
  canonicalIdentifier: CanonicalInsightIdentifier;
}> {
  const canonicalIdentifier = canonicalizeInsightIdentifier({
    entityType: input.entityType,
    identifierType: input.identifierType,
    identifierValue: input.identifierValue,
  });

  const entityType = canonicalIdentifier.entityType;
  const canonicalType = canonicalIdentifier.identifierType;
  const canonicalValue = canonicalIdentifier.identifierValue;

  if (canonicalType && canonicalValue && canonicalIdentifier.strength !== "NONE") {
    const candidates = await tx.insightEntity.findMany({
      where: {
        companyId: input.companyId,
        entityType,
        status: "ACTIVE",
        identifierValue: { not: null },
      },
    });

    const matchingCandidates = candidates.filter((candidate) => {
      const candidateCanonical = canonicalizeInsightIdentifier({
        entityType: candidate.entityType,
        identifierType: candidate.identifierType,
        identifierValue: candidate.identifierValue,
      });

      if (canonicalIdentifier.strength === "STRONG") {
        return (
          candidateCanonical.strength === "STRONG" &&
          candidateCanonical.identifierType === canonicalType &&
          candidateCanonical.identifierValue === canonicalValue
        );
      }

      if (canonicalIdentifier.strength === "EXACT") {
        return (
          candidateCanonical.identifierType === canonicalType &&
          candidateCanonical.identifierValue === canonicalValue
        );
      }

      // WEAK auðkenni mega aðeins endurnýta nákvæmlega sömu merkingu/heiti.
      return (
        candidateCanonical.identifierType === canonicalType &&
        candidateCanonical.identifierValue === canonicalValue &&
        normalizeEntityName(candidate.name) === normalizeEntityName(input.name)
      );
    });

    const preferred = choosePreferredCandidate(matchingCandidates, canonicalType);
    if (preferred) {
      return {
        entity: preferred,
        created: false,
        matchedBy: "IDENTIFIER",
        canonicalIdentifier,
      };
    }
  } else {
    const existingByName = await tx.insightEntity.findFirst({
      where: {
        companyId: input.companyId,
        entityType,
        name: input.name,
        status: "ACTIVE",
      },
      orderBy: { id: "asc" },
    });

    if (existingByName) {
      return {
        entity: existingByName,
        created: false,
        matchedBy: "NAME",
        canonicalIdentifier,
      };
    }
  }

  const entity = await tx.insightEntity.create({
    data: {
      companyId: input.companyId,
      entityType,
      name: input.name,
      status: "ACTIVE",
      identifierType: canonicalType,
      identifierValue: canonicalValue,
      relationshipStatus: input.relationshipStatus ?? "UNCONFIRMED",
      metadata: input.metadata,
    },
  });

  return {
    entity,
    created: true,
    matchedBy: "CREATED",
    canonicalIdentifier,
  };
}
