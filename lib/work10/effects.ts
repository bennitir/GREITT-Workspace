import type { Work10EffectCandidate } from "@/lib/work10/domain";

type LaborFactForEffect = {
  id: number;
  durationMinutes: number;
  workDate: Date;
  voidedAt: Date | null;
  employee?: {
    compensations: Array<{
      validFrom: Date;
      validTo: Date | null;
      internalCostPerMinute: number | null;
    }>;
  } | null;
};

function utcDateKey(value: Date) {
  return (
    value.getUTCFullYear() * 10_000 +
    (value.getUTCMonth() + 1) * 100 +
    value.getUTCDate()
  );
}

function internalRateForFact(fact: LaborFactForEffect) {
  const rows = fact.employee?.compensations ?? [];
  const workDateKey = utcDateKey(fact.workDate);
  const row = rows
    .filter((item) => {
      const validFromKey = utcDateKey(item.validFrom);
      const validToKey = item.validTo ? utcDateKey(item.validTo) : null;
      return (
        validFromKey <= workDateKey &&
        (validToKey === null || validToKey >= workDateKey)
      );
    })
    .sort((a, b) => utcDateKey(b.validFrom) - utcDateKey(a.validFrom))[0];
  return row?.internalCostPerMinute ?? null;
}

export function deriveWork10LaborEffectCandidates(
  workPartId: number,
  laborFacts: LaborFactForEffect[],
): Work10EffectCandidate[] {
  const activeFacts = laborFacts.filter(
    (fact) => !fact.voidedAt && fact.durationMinutes > 0,
  );

  if (activeFacts.length === 0) {
    return [];
  }

  const durationMinutes = activeFacts.reduce(
    (sum, fact) => sum + fact.durationMinutes,
    0,
  );
  const sourceFactIds = activeFacts.map((fact) => String(fact.id));
  const rates = activeFacts.map((fact) => internalRateForFact(fact));
  const resolvedFactCount = rates.filter((rate) => rate !== null).length;
  const missingFactCount = activeFacts.length - resolvedFactCount;
  const allRatesKnown = missingFactCount === 0;
  const amountIsk = allRatesKnown
    ? activeFacts.reduce(
        (sum, fact, index) =>
          sum + fact.durationMinutes * (rates[index] ?? 0),
        0,
      )
    : null;

  return [
    {
      id: `labor-cost-basis:${workPartId}`,
      workPartId: String(workPartId),
      kind: "LABOR_COST_BASIS",
      sourceFactKind: "LABOR",
      sourceFactIds,
      quantity: { value: durationMinutes, unit: "MINUTE" },
      status: allRatesKnown ? "RATE_READY" : "RULE_REQUIRED",
      amountIsk,
      rateCoverage: {
        totalFactCount: activeFacts.length,
        resolvedFactCount,
        missingFactCount,
      },
    },
    {
      id: `labor-sales-basis:${workPartId}`,
      workPartId: String(workPartId),
      kind: "LABOR_SALES_BASIS",
      sourceFactKind: "LABOR",
      sourceFactIds,
      quantity: { value: durationMinutes, unit: "MINUTE" },
      status: "RULE_REQUIRED",
    },
  ];
}


type UsageFactForEffect = {
  id: number;
  kind: string;
  resourceCode: string | null;
  resourceLabel: string;
  quantity: number;
  unit: string;
  customUnit: string | null;
  voidedAt: Date | null;
  inventoryItemId?: number | null;
  inventoryMovement?: {
    voidedAt: Date | null;
    unitCost: number | null;
  } | null;
  resourceUnitCostIsk?: number | null;
};

export function deriveWork10UsageEffectCandidates(
  workPartId: number,
  usageFacts: UsageFactForEffect[],
): Work10EffectCandidate[] {
  const materialEffects = usageFacts
    .filter(
      (fact) =>
        !fact.voidedAt &&
        fact.kind === "MATERIAL" &&
        Number.isFinite(fact.quantity) &&
        fact.quantity > 0,
    )
    .flatMap((fact) => {
      const quantity = {
        value: fact.quantity,
        unit: fact.unit as Work10EffectCandidate["quantity"]["unit"],
        customUnit: fact.customUnit,
      };
      const common = {
        workPartId: String(workPartId),
        sourceFactKind: "USAGE" as const,
        sourceFactIds: [String(fact.id)],
        quantity,
        resourceLabel: fact.resourceLabel,
        resourceCode: fact.resourceCode,
      };

      const activeMovement =
        fact.inventoryMovement && !fact.inventoryMovement.voidedAt
          ? fact.inventoryMovement
          : null;
      const hasAppliedInventoryMovement = Boolean(
        fact.inventoryItemId && activeMovement,
      );
      const unitCost = activeMovement?.unitCost ?? null;
      const hasUnitCost =
        unitCost !== null && Number.isFinite(unitCost) && unitCost >= 0;

      return [
        {
          ...common,
          id: `material-inventory-basis:${fact.id}`,
          kind: "MATERIAL_INVENTORY_BASIS" as const,
          status: hasAppliedInventoryMovement
            ? ("APPLIED" as const)
            : ("LINK_REQUIRED" as const),
        },
        {
          ...common,
          id: `material-cost-basis:${fact.id}`,
          kind: "MATERIAL_COST_BASIS" as const,
          status: hasAppliedInventoryMovement
            ? hasUnitCost
              ? ("COST_READY" as const)
              : ("COST_MISSING" as const)
            : ("RULE_REQUIRED" as const),
          amountIsk: hasAppliedInventoryMovement && hasUnitCost
            ? fact.quantity * (unitCost ?? 0)
            : null,
        },
        {
          ...common,
          id: `material-sales-basis:${fact.id}`,
          kind: "MATERIAL_SALES_BASIS" as const,
          status: "RULE_REQUIRED" as const,
        },
      ];
    });

  const resourceEffects = usageFacts
    .filter(
      (fact) =>
        !fact.voidedAt &&
        fact.kind !== "MATERIAL" &&
        Number.isFinite(fact.quantity) &&
        fact.quantity > 0,
    )
    .flatMap((fact) => {
      const quantity = {
        value: fact.quantity,
        unit: fact.unit as Work10EffectCandidate["quantity"]["unit"],
        customUnit: fact.customUnit,
      };
      const common = {
        workPartId: String(workPartId),
        sourceFactKind: "USAGE" as const,
        sourceFactIds: [String(fact.id)],
        quantity,
        resourceLabel: fact.resourceLabel,
        resourceCode: fact.resourceCode,
      };
      const costRate = fact.resourceUnitCostIsk ?? null;
      const hasCostRate = costRate !== null && Number.isFinite(costRate) && costRate >= 0;

      return [
        {
          ...common,
          id: `resource-cost-basis:${fact.id}`,
          kind: "RESOURCE_COST_BASIS" as const,
          status: hasCostRate ? ("COST_READY" as const) : ("COST_MISSING" as const),
          amountIsk: hasCostRate ? fact.quantity * (costRate ?? 0) : null,
        },
        {
          ...common,
          id: `resource-sales-basis:${fact.id}`,
          kind: "RESOURCE_SALES_BASIS" as const,
          status: "RULE_REQUIRED" as const,
        },
      ];
    });

  return [...materialEffects, ...resourceEffects];
}
