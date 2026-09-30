import type { BankBookingCandidate } from "./candidates";
import type { BankFinancialEventCandidate } from "./event-candidates";

export type BankFinancialEventCandidateWithReceipts =
  BankFinancialEventCandidate & {
    primaryReceiptIds: readonly number[];
  };

export type CrossLayerEventCandidateGroup<
  TEvent extends BankFinancialEventCandidateWithReceipts =
    BankFinancialEventCandidateWithReceipts,
> = {
  eventCandidate: TEvent;
  bookingCandidates: BankBookingCandidate[];
  sharedReceiptIds: number[];
};

/**
 * Presentation-only cross-layer reconciliation.
 *
 * When a bank↔booking candidate and a bank↔FinancialEvent candidate belong to
 * the same bank transaction and the FinancialEvent has a PRIMARY link to the
 * booking candidate's Receipt, they are two views of the same source document.
 * Keep one FinancialEvent confirmation action and retain the booking as
 * evidence instead of presenting two independent choices.
 *
 * This function never confirms, persists or infers payment state.
 */
export function combineBankReconciliationCandidates<
  TEvent extends BankFinancialEventCandidateWithReceipts,
>(
  bookingCandidates: readonly BankBookingCandidate[],
  eventCandidates: readonly TEvent[],
) {
  const mergedBookings = new Set<BankBookingCandidate>();

  const eventGroups: CrossLayerEventCandidateGroup<TEvent>[] =
    eventCandidates.map((eventCandidate) => {
      const receiptIds = new Set(eventCandidate.primaryReceiptIds);
      const matchingBookings = bookingCandidates.filter(
        (bookingCandidate) =>
          bookingCandidate.bankTransactionId ===
            eventCandidate.bankTransactionId &&
          receiptIds.has(bookingCandidate.receiptId),
      );

      for (const bookingCandidate of matchingBookings) {
        mergedBookings.add(bookingCandidate);
      }

      return {
        eventCandidate,
        bookingCandidates: matchingBookings,
        sharedReceiptIds: [
          ...new Set(
            matchingBookings.map(
              (bookingCandidate) => bookingCandidate.receiptId,
            ),
          ),
        ].sort((a, b) => a - b),
      };
    });

  return {
    eventGroups,
    standaloneBookingCandidates: bookingCandidates.filter(
      (candidate) => !mergedBookings.has(candidate),
    ),
  };
}
