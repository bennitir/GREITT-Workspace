/**
 * Capability boundary for source-ledger preparation, including bank and card
 * account creation, statement preview/import and preview cancellation.
 * Membership and a VIEWER's stale flags never authorize a mutation.
 * This pure policy is called only after request session/company validation.
 */
export type FinancialSourceMutationAccess = {
  allowed: boolean;
  role: string | null;
  canPrepareBookkeeping: boolean;
};

export function requireFinancialSourcePrepareAccess(
  access: FinancialSourceMutationAccess,
): void {
  if (!access.allowed || access.role === "VIEWER" || !access.canPrepareBookkeeping) {
    throw new Error("Þú hefur ekki heimild til að stofna eða flytja inn banka- og kortagögn.");
  }
}
