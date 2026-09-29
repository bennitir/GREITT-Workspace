import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBankBookingCandidateGraph,
} from "./candidates";

test("unique exact match becomes UNIQUE_STRONG", () => {
  const result = buildBankBookingCandidateGraph(
    [
      {
        id: 1,
        date: new Date("2026-01-30T12:00:00Z"),
        text: "Greiðslustofa lífeyrissjóða",
        amount: 324243,
      },
    ],
    [
      {
        entryId: 10,
        receiptId: 100,
        voucherNumber: null,
        date: new Date("2026-01-30T00:00:00Z"),
        partyText: "Greiðslustofa lífeyrissjóða",
        description: null,
        account: "1510",
        entryText: "",
        debit: 324243,
        credit: 0,
      },
    ]
  );

  assert.equal(result[0].state, "UNIQUE_STRONG");
  assert.equal(result[0].strongCandidates.length, 1);
  assert.equal(result[0].strongCandidates[0].mutuallyUnique, true);
});

test("two bank transactions competing for one booking are ambiguous", () => {
  const result = buildBankBookingCandidateGraph(
    [
      {
        id: 1,
        date: new Date("2026-01-30T12:00:00Z"),
        text: "Próf fyrirtæki",
        amount: -22160,
      },
      {
        id: 2,
        date: new Date("2026-01-30T12:00:00Z"),
        text: "Próf fyrirtæki",
        amount: -22160,
      },
    ],
    [
      {
        entryId: 20,
        receiptId: 200,
        voucherNumber: null,
        date: new Date("2026-01-30T00:00:00Z"),
        partyText: "Próf fyrirtæki",
        description: null,
        account: "1510",
        entryText: "",
        debit: 0,
        credit: 22160,
      },
    ]
  );

  assert.equal(result[0].state, "AMBIGUOUS_STRONG");
  assert.equal(result[1].state, "AMBIGUOUS_STRONG");

  assert.equal(
    result[0].strongCandidates[0].mutuallyUnique,
    false
  );

  assert.equal(
    result[1].strongCandidates[0].mutuallyUnique,
    false
  );
});

test("same amount and date without party match stays POSSIBLE", () => {
  const result = buildBankBookingCandidateGraph(
    [
      {
        id: 1,
        date: new Date("2026-01-02T12:00:00Z"),
        text: "Annar mótaðili",
        amount: -901,
      },
    ],
    [
      {
        entryId: 30,
        receiptId: 300,
        voucherNumber: null,
        date: new Date("2026-01-02T00:00:00Z"),
        partyText: "Sjóvá-Almennar tryggingar hf.",
        description: null,
        account: "1510",
        entryText: "",
        debit: 0,
        credit: 901,
      },
    ]
  );

  assert.equal(result[0].state, "POSSIBLE");
  assert.equal(
    result[0].possibleCandidates[0].reason,
    "EXACT_DATE_AMOUNT"
  );
});

test("near date plus party match stays POSSIBLE", () => {
  const result = buildBankBookingCandidateGraph(
    [
      {
        id: 1,
        date: new Date("2026-01-05T12:00:00Z"),
        text: "Ergo fjármögnunarþjónusta",
        amount: -75412,
      },
    ],
    [
      {
        entryId: 40,
        receiptId: 400,
        voucherNumber: null,
        date: new Date("2026-01-03T00:00:00Z"),
        partyText:
          "Ergo fjármögnunarþjónusta Íslandsbanka",
        description: null,
        account: "1510",
        entryText: "",
        debit: 0,
        credit: 75412,
      },
    ]
  );

  assert.equal(result[0].state, "POSSIBLE");
  assert.equal(
    result[0].possibleCandidates[0].reason,
    "NEAR_DATE_AMOUNT_PARTY"
  );
});
test("one bank transaction competing with two bookings is ambiguous", () => {
  const result = buildBankBookingCandidateGraph(
    [
      {
        id: 1,
        date: new Date("2026-02-01T12:00:00Z"),
        text: "Pr�f fyrirt�ki",
        amount: -5000,
      },
    ],
    [
      {
        entryId: 51,
        receiptId: 501,
        voucherNumber: null,
        date: new Date("2026-02-01T00:00:00Z"),
        partyText: "Pr�f fyrirt�ki",
        description: null,
        account: "1510",
        entryText: "",
        debit: 0,
        credit: 5000,
      },
      {
        entryId: 52,
        receiptId: 502,
        voucherNumber: null,
        date: new Date("2026-02-01T00:00:00Z"),
        partyText: "Pr�f fyrirt�ki",
        description: null,
        account: "1510",
        entryText: "",
        debit: 0,
        credit: 5000,
      },
    ]
  );

  assert.equal(result[0].state, "AMBIGUOUS_STRONG");
  assert.equal(result[0].strongCandidates.length, 2);
  assert.equal(result[0].strongCandidates[0].mutuallyUnique, false);
  assert.equal(result[0].strongCandidates[1].mutuallyUnique, false);
});
