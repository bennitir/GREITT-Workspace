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

function internalRateForFact(fact: LaborFactForEffect) {
  const rows = fact.employee?.compensations ?? [];
  const row = rows
    .filter((item) => item.validFrom <= fact.workDate && (!item.validTo || item.validTo >= fact.workDate))
    .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime())[0];
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
  const allRatesKnown = rates.every((rate) => rate !== null);
  const amountIsk = allRatesKnown
    ? activeFacts.reduce((sum, fact, index) => sum + fact.durationMinutes * (rates[index] ?? 0), 0)
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
  inventoryMovement?: { voidedAt: Date | null } | null;
};

export function deriveWork10UsageEffectCandidates(
  workPartId: number,
  usageFacts: UsageFactForEffect[],
): Work10EffectCandidate[] {
  return usageFacts
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

      return [
        {
          ...common,
          id: `material-inventory-basis:${fact.id}`,
          kind: "MATERIAL_INVENTORY_BASIS" as const,
          status:
            fact.inventoryItemId && fact.inventoryMovement && !fact.inventoryMovement.voidedAt
              ? ("APPLIED" as const)
              : ("LINK_REQUIRED" as const),
        },
        {
          ...common,
          id: `material-cost-basis:${fact.id}`,
          kind: "MATERIAL_COST_BASIS" as const,
          status: "RULE_REQUIRED" as const,
        },
        {
          ...common,
          id: `material-sales-basis:${fact.id}`,
          kind: "MATERIAL_SALES_BASIS" as const,
          status: "RULE_REQUIRED" as const,
        },
      ];
    });
}
