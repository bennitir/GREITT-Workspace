export type BookkeepingCapabilityAccess = {
  accessRole: string;
  canPrepareBookkeeping: boolean;
  canReviewBookkeeping: boolean;
  canReconcileBookkeeping: boolean;
  canApproveExpenses: boolean;
  canBookEntries: boolean;
  canManageCompanySettings: boolean;
};

export type EffectiveBookkeepingCapabilities = Omit<
  BookkeepingCapabilityAccess,
  "accessRole"
>;

export const READ_ONLY_BOOKKEEPING_CAPABILITIES: EffectiveBookkeepingCapabilities = {
  canPrepareBookkeeping: false,
  canReviewBookkeeping: false,
  canReconcileBookkeeping: false,
  canApproveExpenses: false,
  canBookEntries: false,
  canManageCompanySettings: false,
};

/**
 * VIEWER er harður read-only boundary fyrir bókhald.
 * Granular capability-gildi mega ekki óvart yfirskrifa það, jafnvel þótt
 * eldri UserCompany-röð beri gömul/stale true-gildi.
 */
export function effectiveBookkeepingCapabilities(
  access: BookkeepingCapabilityAccess,
): EffectiveBookkeepingCapabilities {
  if (access.accessRole === "VIEWER") {
    return { ...READ_ONLY_BOOKKEEPING_CAPABILITIES };
  }

  return {
    canPrepareBookkeeping: access.canPrepareBookkeeping,
    canReviewBookkeeping: access.canReviewBookkeeping,
    canReconcileBookkeeping: access.canReconcileBookkeeping,
    canApproveExpenses: access.canApproveExpenses,
    canBookEntries: access.canBookEntries,
    canManageCompanySettings: access.canManageCompanySettings,
  };
}
