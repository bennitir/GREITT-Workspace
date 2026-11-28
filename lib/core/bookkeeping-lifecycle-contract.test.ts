import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

// Structural regression checks supplement but NEVER substitute for DB interleaving tests.
const source = fs.readFileSync(new URL("../../app/actions/receiptActions.ts", import.meta.url), "utf8");
function section(start: string, end: string): string {
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin + start.length);
  assert.ok(begin >= 0 && finish > begin, `Missing section ${start}`);
  return source.slice(begin, finish);
}

const manual = section("export async function approveManualReceipt(", "function roundVatDeductionAmount(");
const detected = section("export async function approveDetectedDocument(", "export async function approveAiSuggestion(");
const deleteChild = section("export async function deleteDetectedDocument(", "export async function deleteReceipt(");
const deleteParent = section("export async function deleteReceipt(", "export async function markReceiptReviewed(");
const markReviewed = section("export async function markReceiptReviewed(", "export async function markReceiptNeedsAttention(");
const contentMutation = section("async function claimDetectedDocumentContentMutation(", "async function saveReceiptFile(");

test("manual posting locks before claim and checks persisted child and ledger state", () => {
  assert.ok(manual.indexOf("await lockDocumentIdentityCompany(tx, companyId)") > 0);
  assert.ok(manual.indexOf("await lockDocumentIdentityCompany(tx, companyId)") < manual.indexOf("const postingClaim ="));
  assert.match(manual, /tx\.aiDetectedDocument\.count\(/);
  assert.match(manual, /tx\.receiptEntry\.count\(/);
  assert.match(manual, /assertManualReceiptPostingAvailable/);
});

test("detected posting holds the same company-scoped lock before child claim", () => {
  assert.ok(detected.indexOf("await lockDocumentIdentityCompany(tx, document.receipt.companyId)") < detected.indexOf("const postingClaim ="));
});

test("content edits acquire same lock before revision CAS", () => {
  assert.ok(contentMutation.indexOf("await lockDocumentIdentityCompany(tx, companyId)") < contentMutation.indexOf("const current ="));
  assert.match(contentMutation, /contentRevision: expectedRevision/);
});

test("child deletion checks under lock and conditionally deletes without touching booked child", () => {
  assert.ok(deleteChild.indexOf("await lockDocumentIdentityCompany(tx, companyId)") < deleteChild.indexOf("tx.aiDetectedDocument.findFirst"));
  assert.ok(deleteChild.indexOf("assertUnpostedDocument") < deleteChild.indexOf("deleteMany"));
  assert.match(deleteChild, /invalidateReviewedFinancialDerivationsForContentChange/);
  assert.match(deleteChild, /reviewedAt: document\.reviewedAt/);
  assert.match(deleteChild, /approvedAt: null/);
  assert.match(deleteChild, /voucherNumber: null/);
  assert.match(deleteChild, /removed\.count !== 1/);
});

test("parent deletion checks booked children and ledger lines after lock", () => {
  assert.ok(deleteParent.indexOf("await lockDocumentIdentityCompany(tx, companyId)") < deleteParent.indexOf("tx.receipt.findFirst"));
  assert.match(deleteParent, /assertUnpostedReceipt/);
  assert.match(deleteParent, /_count: \{ select: \{ entries: true \} \}/);
  assert.match(deleteParent, /tx\.receipt\.deleteMany/);
  assert.match(deleteParent, /updatedAt: receipt\.updatedAt/);
  assert.match(deleteParent, /removed\.count !== 1/);
});

test("receipt review cannot overwrite concurrently approved status", () => {
  assert.match(markReviewed, /await lockDocumentIdentityCompany/);
  assert.match(markReviewed, /tx\.receipt\.updateMany/);
  assert.match(markReviewed, /status: \{ not: "APPROVED" \}/);
  assert.match(markReviewed, /updated\.count !== 1/);
});
