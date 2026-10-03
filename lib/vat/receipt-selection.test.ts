import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVatReceiptWhere,
  hasDocumentLevelVatBookings,
} from "./receipt-selection";

test("VSK query includes approved receipts and receipts with approved child documents", () => {
  assert.deepEqual(buildVatReceiptWhere(7), {
    companyId: 7,
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
  });
});

test("document-level booking is authoritative when approved documents have booking lines", () => {
  assert.equal(
    hasDocumentLevelVatBookings([
      { bookingEntries: [] },
      { bookingEntries: [{ account: "2510" }] },
    ]),
    true,
  );
});

test("legacy approved documents with no document entries fall back to ReceiptEntry", () => {
  assert.equal(
    hasDocumentLevelVatBookings([
      { bookingEntries: [] },
      { bookingEntries: [] },
    ]),
    false,
  );
});
