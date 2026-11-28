import assert from "node:assert/strict";
import test from "node:test";
import { assertFinalBookkeepingPosting } from "./bookkeeping-final-posting";

const date = new Date("2026-10-08T12:00:00.000Z");
const accounts = [
  { number: "4010", isActive: true },
  { number: "2230", isActive: true },
  { number: "2520", isActive: false },
];
const valid = [
  { account: "4010", debit: 1234.50, credit: 0 },
  { account: "2230", debit: 0, credit: 1234.50 },
];

test("valid balanced posting with active company accounts passes", () => {
  assert.doesNotThrow(() => assertFinalBookkeepingPosting(valid, accounts, date));
});

test("rejects posting with no date, invalid amount, negative, zero or both sides", () => {
  for (const dt of [undefined, null, new Date("invalid")]) {
    assert.throws(() => assertFinalBookkeepingPosting(valid, accounts, dt));
  }
  for (const debit of [NaN, Infinity, -1, 0, 1.123, 1e20]) {
    assert.throws(() => assertFinalBookkeepingPosting([
      { account: "4010", debit, credit: 0 },
      { account: "2230", debit: 0, credit: 1 },
    ], accounts, date));
  }
  assert.throws(() => assertFinalBookkeepingPosting([
    { account: "4010", debit: 100, credit: 1 },
    { account: "2230", debit: 0, credit: 99 },
  ], accounts, date));
});

test("rejects imbalanced totals and non-active/foreign company account numbers", () => {
  assert.throws(() => assertFinalBookkeepingPosting([
    { account: "4010", debit: 100, credit: 0 },
    { account: "2230", debit: 0, credit: 99.99 },
  ], accounts, date));
  for (const account of ["2520", "9999", " 4010"]) {
    assert.throws(() => assertFinalBookkeepingPosting([
      { account, debit: 100, credit: 0 },
      { account: "2230", debit: 0, credit: 100 },
    ], accounts, date));
  }
});

test("does not incorrectly balance through floating-point addition", () => {
  assert.doesNotThrow(() => assertFinalBookkeepingPosting([
    { account: "4010", debit: 0.1, credit: 0 },
    { account: "4010", debit: 0.2, credit: 0 },
    { account: "2230", debit: 0, credit: 0.3 },
  ], accounts, date));
});
