/**
 * Pure fail-closed lifecycle decisions. The caller MUST fetch these facts
 * inside the same locked transaction used for the subsequent database write.
 * These checks do not replace the conditional SQL deletion/claim.
 */
export type DeletableDocumentState = {
  approvedAt: Date | null;
  voucherNumber: number | null;
};

export function assertUnpostedDocument(document: DeletableDocumentState): void {
  if (document.approvedAt !== null || document.voucherNumber !== null) {
    throw new Error("Ekki er hægt að eyða greindu fylgiskjali sem hefur þegar verið bókað.");
  }
}

export function assertUnpostedReceipt(receipt: {
  status: string;
  voucherNumber: number | null;
  _count: { entries: number };
  aiDetectedDocuments: readonly DeletableDocumentState[];
}): void {
  if (receipt.status === "APPROVED" || receipt.voucherNumber !== null ||
      receipt._count.entries !== 0 ||
      receipt.aiDetectedDocuments.some((document) =>
        document.approvedAt !== null || document.voucherNumber !== null)) {
    throw new Error("Ekki er hægt að eyða fylgiskjali sem hefur bókun eða bókuð undirskjöl.");
  }
}

export function assertManualReceiptPostingAvailable(params: {
  previous: { updatedAt: Date; voucherNumber: number | null };
  current: { updatedAt: Date; status: string; voucherNumber: number | null } | null;
  bookedChildCount: number;
  postedEntryCount: number;
}): void {
  const { previous, current, bookedChildCount, postedEntryCount } = params;
  if (!current || current.status === "APPROVED" ||
      current.updatedAt.getTime() !== previous.updatedAt.getTime() ||
      current.voucherNumber !== previous.voucherNumber) {
    throw new Error("Fylgiskjalið breyttist eftir að það var opnað. Endurhlaðið áður en bókað er.");
  }
  if (!Number.isSafeInteger(bookedChildCount) || bookedChildCount < 0 ||
      !Number.isSafeInteger(postedEntryCount) || postedEntryCount < 0 ||
      bookedChildCount > 0 || postedEntryCount > 0) {
    throw new Error("Fylgiskjalið inniheldur þegar bókaðar línur eða bókuð undirskjöl.");
  }
}
