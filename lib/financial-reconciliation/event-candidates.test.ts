import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBankFinancialEventCandidates as build,
  type EventBankCandidateInput,
  type FinancialEventCandidateInput,
} from "./event-candidates";

const account = { id: 1, companyId: 2 };
const date = (day: number) => new Date(Date.UTC(2026, 0, day));
const bank: EventBankCandidateInput = {
  id: 3, bankAccountId: 1, amount: "-36027", date: date(12), reference: null,
};
const event: FinancialEventCandidateInput = {
  id: 4, companyId: 2, eventType: "CHARGE", amount: "36027", eventDate: date(1),
  externalReference: null, currency: "ISK",
};

test("CHARGE +36027 and bank -36027 eleven days apart is POSSIBLE EXTENDED", () => {
  assert.deepEqual(build(account, [bank], [event]), [{
    bankTransactionId: 3, eventId: 4, eventType: "CHARGE", eventAmount: "36027",
    bankAmount: "-36027", eventDate: date(1), bankDate: date(12), dateDistanceDays: 11,
    externalReference: null, bankReference: null, reason: "EXACT_EVENT_AMOUNT_EXTENDED_DATE",
    evidence: [], strength: "POSSIBLE",
  }]);
});

test("CREDIT -11427 and bank +11427 three days apart is POSSIBLE NEAR", () => {
  const result = build(account, [{ ...bank, amount: "11427", date: date(4) }],
    [{ ...event, eventType: "CREDIT", amount: "-11427" }]);
  assert.equal(result[0]?.reason, "EXACT_EVENT_AMOUNT_NEAR_DATE");
  assert.equal(result[0]?.strength, "POSSIBLE");
});

test("wrong direction and same signs never match", () => {
  for (const [eventType, eventAmount, bankAmount] of [
    ["CHARGE", "-100", "100"], ["CREDIT", "100", "-100"],
    ["CHARGE", "100", "100"], ["CREDIT", "-100", "-100"],
  ]) assert.deepEqual(build(account, [{ ...bank, amount: bankAmount }],
    [{ ...event, eventType, amount: eventAmount }]), []);
});

test("UTC calendar day boundaries are inclusive and symmetric", () => {
  for (const days of [0, 3, 4, 30, 31]) {
    for (const direction of [-1, 1]) {
      const result = build(account, [{ ...bank, date: date(1 + days * direction) }], [event]);
      assert.equal(result.length, days <= 30 ? 1 : 0);
      if (result.length) assert.equal(result[0].reason, days <= 3
        ? "EXACT_EVENT_AMOUNT_NEAR_DATE" : "EXACT_EVENT_AMOUNT_EXTENDED_DATE");
    }
  }
  assert.equal(build(account, [{ ...bank, date: new Date("2026-01-04T23:59:59Z") }], [event])[0]?.dateDistanceDays, 3);
});

test("all ambiguous events and competing bank transactions remain POSSIBLE", () => {
  const result = build(account, [bank, { ...bank, id: 5 }], [{ ...event, id: 6 }, event]);
  assert.deepEqual(result.map((c) => [c.bankTransactionId, c.eventId]), [[3, 4], [3, 6], [5, 4], [5, 6]]);
  assert.ok(result.every((c) => c.strength === "POSSIBLE" && !("mutuallyUnique" in c)));
});

test("only nonempty normalized exact references add evidence, never bypass amount/date", () => {
  const referenced = { ...event, externalReference: " Inv-001 " };
  const result = build(account, [{ ...bank, reference: "inv-001" }], [referenced]);
  assert.deepEqual(result[0].evidence, ["EXACT_EVENT_REFERENCE"]);
  assert.equal(result[0].strength, "POSSIBLE");
  for (const reference of ["Inv-001 extra", "Inv001", "Inv-01", "", null]) {
    assert.deepEqual(build(account, [{ ...bank, reference }], [referenced])[0].evidence, []);
  }
  assert.deepEqual(build(account, [{ ...bank, reference: "inv-001", date: date(32) }], [referenced]), []);
  assert.deepEqual(build(account, [{ ...bank, reference: "inv-001", amount: "-1" }], [referenced]), []);
  assert.deepEqual(build(account, [{ ...bank, reference: " " }], [{ ...event, externalReference: " " }])[0].evidence, []);
});

test("missing, invalid, unsupported and cross-company inputs fail closed", () => {
  for (const patch of [
    { amount: null }, { amount: "0" }, { eventDate: null }, { eventDate: new Date(NaN) },
    { companyId: 99 }, { eventType: "ANNUAL_ASSESSMENT" }, { currency: "EUR" },
  ]) assert.deepEqual(build(account, [bank], [{ ...event, ...patch }]), []);
  assert.deepEqual(build(account, [{ ...bank, bankAccountId: 99 }], [event]), []);
  assert.deepEqual(build(account, [{ ...bank, date: new Date(NaN) }], [event]), []);
});

test("decimal comparison is exact, never rounded or coerced through Number", () => {
  for (const [eventAmount, bankAmount, matches] of [
    ["36027.00", "-36027", true], ["100.10", "-100.1", true],
    ["100.101", "-100.10", false], ["100.10", "-100.11", false],
    ["9007199254740993.01", "-9007199254740993.01", true],
    ["9007199254740993.01", "-9007199254740993.02", false],
    ["1e2", "-100", false], ["", "0", false], ["NaN", "-100", false],
  ] as const) {
    assert.equal(build(account, [{ ...bank, amount: bankAmount }],
      [{ ...event, amount: eventAmount }]).length, matches ? 1 : 0);
  }
  assert.deepEqual(build(account, [bank], [{ ...event, amount: Infinity }]), []);
  assert.deepEqual(build(account, [bank], [{ ...event, amount: Number.MAX_SAFE_INTEGER }]), []);
});
