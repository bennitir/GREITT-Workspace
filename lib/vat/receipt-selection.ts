export type VatDocumentBookingSource = {
  bookingEntries: readonly unknown[];
};

export function buildVatReceiptWhere(companyId: number) {
  return {
    companyId,
    OR: [
      {
        status: "APPROVED",
      },
      {
        aiDetectedDocuments: {
          some: {
            approvedAt: {
              not: null,
            },
          },
        },
      },
    ],
  };
}

export function hasDocumentLevelVatBookings(
  documents: readonly VatDocumentBookingSource[],
) {
  return documents.some((document) => document.bookingEntries.length > 0);
}
