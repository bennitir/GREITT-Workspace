export type FinancialEventDocumentBookingEntry = {
  id: number;
  account: string;
  text: string;
  debit: number;
  credit: number;
};

export type FinancialEventSourceDocumentContext = {
  receiptId: number;
  receiptStatus: string;
  documentId: number | null;
  reviewedAt: Date | null;
  approvedAt: Date | null;
  documentType: string | null;
  documentRole: string | null;
  bookingEntries: FinancialEventDocumentBookingEntry[];
};

export type SourceDocumentBookingState =
  | "BOOKED"
  | "REVIEWED_NOT_BOOKED"
  | "UNREVIEWED_NOT_BOOKED"
  | "NO_BOOKING_PROPOSAL";

/**
 * Presentation-only classification for source-document booking state.
 * Payment/reconciliation state is deliberately independent from booking state.
 */
export function getSourceDocumentBookingState(
  context: FinancialEventSourceDocumentContext,
): SourceDocumentBookingState {
  if (context.approvedAt) {
    return "BOOKED";
  }

  if (context.bookingEntries.length === 0) {
    return "NO_BOOKING_PROPOSAL";
  }

  return context.reviewedAt
    ? "REVIEWED_NOT_BOOKED"
    : "UNREVIEWED_NOT_BOOKED";
}

export function hasPendingSourceDocumentBooking(
  context: FinancialEventSourceDocumentContext,
) {
  const state = getSourceDocumentBookingState(context);
  return (
    state === "REVIEWED_NOT_BOOKED" ||
    state === "UNREVIEWED_NOT_BOOKED"
  );
}
