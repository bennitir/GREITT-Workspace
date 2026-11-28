import assert from "node:assert/strict";
import test from "node:test";
import {
  assertUnpostedDocument,
  assertUnpostedReceipt,
  assertManualReceiptPostingAvailable,
} from "./bookkeeping-lifecycle-policy";

const time = new Date("2026-10-08T12:00:00.000Z");
const draftDocument = () => ({ approvedAt: null, voucherNumber: null });
const draftReceipt = () => ({
  status: "NEW", voucherNumber: null, _count: { entries: 0 },
  aiDetectedDocuments: [draftDocument()],
});

for (const [name, change] of [
  ["approved child", { approvedAt: time }],
  ["voucher assigned child", { voucherNumber: 48 }],
] as const) {
  test(`document deletion rejects ${name}`, () => {
    assert.throws(() => assertUnpostedDocument({ ...draftDocument(), ...change }), /bókað/);
  });
  test(`parent deletion rejects ${name}`, () => {
    assert.throws(() => assertUnpostedReceipt({ ...draftReceipt(), aiDetectedDocuments: [{ ...draftDocument(), ...change }] }), /bókuð/);
  });
}

test("unposted document and empty draft receipt are deletable", () => {
  assert.doesNotThrow(() => assertUnpostedDocument(draftDocument()));
  assert.doesNotThrow(() => assertUnpostedReceipt(draftReceipt()));
});

for (const [name, change] of [
  ["approved status", { status: "APPROVED" }],
  ["assigned voucher", { voucherNumber: 32 }],
  ["existing ledger lines despite unapproved status", { _count: { entries: 12 } }],
] as const) {
  test(`receipt deletion rejects ${name}`, () => {
    assert.throws(() => assertUnpostedReceipt({ ...draftReceipt(), ...change }), /bókun/);
  });
}

const manual = () => ({
  previous: { updatedAt: time, voucherNumber: null },
  current: { updatedAt: time, status: "NEW", voucherNumber: null },
  bookedChildCount: 0,
  postedEntryCount: 0,
});

test("manual booking may proceed only for unchanged unposted draft", () => {
  assert.doesNotThrow(() => assertManualReceiptPostingAvailable(manual()));
});
test("manual booking rejects stale receipt timestamp", () => {
  assert.throws(() => assertManualReceiptPostingAvailable({ ...manual(), current: { ...manual().current, updatedAt: new Date(time.getTime() + 1000) } }), /breyttist/);
});
test("manual booking rejects posted child although parent is still NEW", () => {
  assert.throws(() => assertManualReceiptPostingAvailable({ ...manual(), bookedChildCount: 1 }), /bókaðar/);
});
test("manual booking rejects existing ReceiptEntry although parent is still NEW", () => {
  assert.throws(() => assertManualReceiptPostingAvailable({ ...manual(), postedEntryCount: 2 }), /bókaðar/);
});
test("manual booking rejects approved receipt and changed voucher", () => {
  assert.throws(() => assertManualReceiptPostingAvailable({ ...manual(), current: { ...manual().current, status: "APPROVED" } }), /breyttist/);
  assert.throws(() => assertManualReceiptPostingAvailable({ ...manual(), current: { ...manual().current, voucherNumber: 10 } }), /breyttist/);
});
test("manual booking rejects invalid counts fail-closed", () => {
  assert.throws(() => assertManualReceiptPostingAvailable({ ...manual(), postedEntryCount: NaN }), /bókaðar/);
});
