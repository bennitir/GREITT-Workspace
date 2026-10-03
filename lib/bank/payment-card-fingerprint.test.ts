import assert from "node:assert/strict";
import test from "node:test";
import {
  cardRowFingerprint,
  normalizePaymentCardFingerprintDate,
  storedPaymentCardTransactionFingerprint,
} from "./payment-card-fingerprint";

const raw = {
  merchantText: "Prófun söluaðili",
  merchantCategory: "",
  foreignAmount: null,
  currency: "",
  exchangeRate: null,
  explanation: "",
  cardPeriod: "",
};

test("normalizes Excel .999/.000 second-boundary drift to the same timestamp", () => {
  const left = new Date("2026-06-04T12:17:58.999Z");
  const right = new Date("2026-06-04T12:17:59.000Z");

  assert.equal(
    normalizePaymentCardFingerprintDate(left).toISOString(),
    "2026-06-04T12:17:59.000Z",
  );
  assert.equal(
    normalizePaymentCardFingerprintDate(right).toISOString(),
    "2026-06-04T12:17:59.000Z",
  );
  assert.equal(
    cardRowFingerprint(7, left, raw, -1234),
    cardRowFingerprint(7, right, raw, -1234),
  );
});

test("keeps genuinely different whole-second timestamps distinct", () => {
  const left = new Date("2026-06-04T12:17:58.000Z");
  const right = new Date("2026-06-04T12:17:59.000Z");

  assert.notEqual(
    cardRowFingerprint(7, left, raw, -1234),
    cardRowFingerprint(7, right, raw, -1234),
  );
});

test("still includes card, amount and merchant identity in the fingerprint", () => {
  const date = new Date("2026-06-04T12:17:59.000Z");
  const base = cardRowFingerprint(7, date, raw, -1234);

  assert.notEqual(base, cardRowFingerprint(8, date, raw, -1234));
  assert.notEqual(base, cardRowFingerprint(7, date, raw, -1235));
  assert.notEqual(
    base,
    cardRowFingerprint(7, date, { ...raw, merchantText: "Annar söluaðili" }, -1234),
  );
});


test("canonicalizes a legacy stored .999 transaction against a new .000 row", () => {
  const incomingDate = new Date("2026-06-05T12:17:59.000Z");
  const incomingFingerprint = cardRowFingerprint(2, incomingDate, raw, -4199);

  const storedFingerprint = storedPaymentCardTransactionFingerprint(2, {
    date: new Date("2026-06-05T12:17:58.999Z"),
    merchantText: raw.merchantText,
    merchantCategory: null,
    foreignAmount: null,
    currency: null,
    exchangeRate: null,
    amount: -4199,
    explanation: null,
    cardPeriod: null,
    sourceRawData: JSON.stringify(raw),
  });

  assert.equal(storedFingerprint, incomingFingerprint);
});
