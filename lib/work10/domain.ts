import type { Work10LocalizedText } from "@/lib/work10/operational-text";

/**
 * Verk 10 – domain-kjarni v0.
 *
 * Domain-gerðirnar eru áfram óháðar Prisma. Fyrsti varanlegi hlutinn,
 * WorkPart, er nú einnig kominn í gagnagrunninn en domain-lagið heldur
 * merkingunni aðskildri frá geymsluútfærslunni.
 */

export type Work10Status =
  | "DRAFT"
  | "READY"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "BLOCKED"
  | "COMPLETED"
  | "CANCELLED";

export type Work10PartStatus =
  | "PLANNED"
  | "READY"
  | "IN_PROGRESS"
  | "ON_HOLD"
  | "BLOCKED"
  | "COMPLETED"
  | "CANCELLED";

export type Work10ResourceKind =
  | "PERSON"
  | "TEAM"
  | "MACHINE"
  | "VEHICLE"
  | "TOOL"
  | "CONTRACTOR"
  | "OTHER";

export type Work10FactKind =
  | "LABOR"
  | "RESOURCE_USAGE"
  | "MATERIAL_USAGE"
  | "TRAVEL"
  | "CONTRACTOR_WORK"
  | "NOTE";

export type Work10MeasureUnit =
  | "PCS"
  | "KG"
  | "L"
  | "M"
  | "M2"
  | "M3"
  | "KM"
  | "HOUR"
  | "MINUTE"
  | "CUSTOM";

export type Work10Identity = {
  /** Innra auðkenni GLÖGGT. */
  internalId: string;

  /** Verknúmer ákveðinnar framkvæmdar. */
  workNumber?: string | null;

  /** Verklykill/samhengi sem má endurtaka á mörgum verkum. */
  workKey?: string | null;

  /** Ytra auðkenni úr eldra kerfi viðskiptavinar. */
  externalId?: string | null;
};

export type Work10Dependency = {
  predecessorPartId: string;
  successorPartId: string;
};

export type Work10Part = {
  id: string;
  /** Þýðanlegt vinnuefni; frumtexti varðveitist alltaf. */
  title: Work10LocalizedText;
  description?: Work10LocalizedText | null;
  status: Work10PartStatus;
  order: number;
  dependencies: Work10Dependency[];
};

export type Work10Assignment = {
  id: string;
  workPartId: string;
  resourceKind: Work10ResourceKind;
  /** Auðkenni auðlindar. Fyrir PERSON er þetta user-id. */
  resourceId: string;
  /** Úthlutun er söguleg staðreynd; brottfall er varðveitt, ekki eytt. */
  removedAt?: Date | null;
};


export type Work10LaborFactSource =
  | "MANUAL"
  | "MOBILE"
  | "IMPORTED"
  | "API"
  | "LEGACY";

export type Work10UsageFactKind =
  | "MATERIAL"
  | "MACHINE_TIME"
  | "VEHICLE"
  | "TRAVEL"
  | "OTHER";

export type Work10UsageFactSource =
  | "MANUAL"
  | "MOBILE"
  | "IMPORTED"
  | "API";

export type Work10UsageFact = {
  id: string;
  workPartId: string;
  kind: Work10UsageFactKind;
  resourceCode?: string | null;
  resourceLabel: string;
  usageDate: Date;
  quantity: Work10Quantity;
  note?: string | null;
  source: Work10UsageFactSource;
  voidedAt?: Date | null;
};

export type Work10LaborFact = {
  id: string;
  workPartId: string;
  userId?: string | null;
  resourceLabel?: string | null;
  workDate: Date;
  startedAt?: Date | null;
  endedAt?: Date | null;
  durationMinutes: number;
  note?: string | null;
  source: Work10LaborFactSource;
  /** Leiðrétting/ógilding varðveitir upprunalegu staðreyndina. */
  voidedAt?: Date | null;
};

export type Work10Quantity = {
  value: number;
  unit: Work10MeasureUnit;
  customUnit?: string | null;
};

export type Work10Fact = {
  id: string;
  workPartId?: string | null;
  kind: Work10FactKind;
  occurredAt: Date;
  quantity?: Work10Quantity | null;

  /** Uppruni þarf alltaf að vera rekjanlegur. */
  source: string;
};

/**
 * Mikilvæg aðgreining:
 * - staðreynd/notkun segir hvað gerðist,
 * - birgðahreyfing segir hvað fór úr/í birgðir,
 * - kostnaður segir rekstraráhrif,
 * - sölulína segir hvað er rukkað.
 * Þetta eru tengdir hlutir en ekki sami hluturinn.
 */

export type Work10EffectCandidateKind =
  | "LABOR_COST_BASIS"
  | "LABOR_SALES_BASIS"
  | "MATERIAL_INVENTORY_BASIS"
  | "MATERIAL_COST_BASIS"
  | "MATERIAL_SALES_BASIS";

export type Work10EffectCandidate = {
  id: string;
  workPartId: string;
  kind: Work10EffectCandidateKind;
  sourceFactKind: "LABOR" | "USAGE";
  sourceFactIds: string[];
  quantity: Work10Quantity;
  resourceLabel?: string | null;
  resourceCode?: string | null;
  status: "RULE_REQUIRED" | "LINK_REQUIRED" | "RATE_READY" | "APPLIED";
  amountIsk?: number | null;
};

export type Work10CommercialEffect = {
  factId: string;
  inventoryMovementId?: string | null;
  costEventId?: string | null;
  salesBasisLineId?: string | null;
};
