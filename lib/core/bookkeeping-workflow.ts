import { prisma } from "@/lib/prisma";

export type BookkeepingWorkflowSettings = {
  preparationMode: "AI" | "MANUAL" | "HYBRID";
  requireReviewBeforeBooking: boolean;
  requireReconciliationBeforeBooking: boolean;
  requireApprovalBeforeBooking: boolean;
  completionMode: "MANUAL_CONFIRMATION" | "AUTO_BOOK";
};

export const DEFAULT_BOOKKEEPING_WORKFLOW: BookkeepingWorkflowSettings = {
  preparationMode: "HYBRID",
  requireReviewBeforeBooking: false,
  requireReconciliationBeforeBooking: false,
  requireApprovalBeforeBooking: false,
  completionMode: "MANUAL_CONFIRMATION",
};

export async function getBookkeepingWorkflowSettings(
  companyId: number
): Promise<BookkeepingWorkflowSettings> {
  const [company, settings] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { receiptEntryMode: true },
    }),
    prisma.companyBookkeepingSettings.findUnique({ where: { companyId } }),
  ]);

  const legacyMode = company?.receiptEntryMode;
  const preparationMode =
    settings?.preparationMode === "AI" ||
    settings?.preparationMode === "MANUAL" ||
    settings?.preparationMode === "HYBRID"
      ? settings.preparationMode
      : legacyMode === "AI" || legacyMode === "MANUAL" || legacyMode === "HYBRID"
        ? legacyMode
        : DEFAULT_BOOKKEEPING_WORKFLOW.preparationMode;

  return {
    preparationMode,
    requireReviewBeforeBooking:
      settings?.requireReviewBeforeBooking ?? false,
    requireReconciliationBeforeBooking:
      settings?.requireReconciliationBeforeBooking ?? false,
    requireApprovalBeforeBooking:
      settings?.requireApprovalBeforeBooking ?? false,
    completionMode:
      settings?.completionMode === "AUTO_BOOK"
        ? "AUTO_BOOK"
        : "MANUAL_CONFIRMATION",
  };
}

export function getOutstandingBookkeepingControls(
  settings: BookkeepingWorkflowSettings,
  state: { reviewed: boolean; reconciled: boolean; approved: boolean }
) {
  const outstanding: Array<"REVIEW" | "RECONCILIATION" | "APPROVAL"> = [];

  if (settings.requireReviewBeforeBooking && !state.reviewed) outstanding.push("REVIEW");
  if (settings.requireReconciliationBeforeBooking && !state.reconciled) {
    outstanding.push("RECONCILIATION");
  }
  if (settings.requireApprovalBeforeBooking && !state.approved) outstanding.push("APPROVAL");

  return outstanding;
}
