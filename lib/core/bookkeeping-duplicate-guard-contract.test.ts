import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../../app/actions/receiptActions.ts", import.meta.url),
  "utf8",
);

function functionSection(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`);

  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`);

  return source.slice(start, end);
}

const approvedCandidatePattern = /approvedAt:\s*\{\s*not:\s*null\s*,?\s*\}/;

test("merchant/date/amount duplicate guard also runs when receiptNumber is missing", () => {
  const body = functionSection(
    "export async function approveDetectedDocument(",
    "export async function approveManualReceipt(",
  );

  const transactionGuardStart = body.indexOf('perf("tx company + VAT")');
  assert.ok(transactionGuardStart >= 0, "booking transaction guard marker is required");

  const possibleDuplicate = body.indexOf(
    "const possibleDuplicate =",
    transactionGuardStart,
  );
  assert.ok(possibleDuplicate >= 0, "merchant/date/amount duplicate query is required");

  const receiptNumberGate = body.indexOf(
    "if (document.receiptNumber)",
    transactionGuardStart,
  );
  assert.ok(receiptNumberGate >= 0, "receipt-number duplicate gate is required");

  assert.ok(
    possibleDuplicate < receiptNumberGate,
    "merchant/date/amount duplicate protection must run before and independently of receiptNumber gating",
  );

  const independentGuard = body.slice(transactionGuardStart, receiptNumberGate);
  assert.doesNotMatch(
    independentGuard,
    /if\s*\(document\.receiptNumber\)/,
    "a missing receiptNumber must not bypass merchant/date/amount duplicate protection",
  );
  assert.match(independentGuard, /!allowPossibleDuplicate/);
  assert.match(independentGuard, /document\.merchantName/);
  assert.match(independentGuard, /document\.date/);
  assert.match(independentGuard, /document\.totalAmount\s*!=\s*null/);
  assert.match(independentGuard, /merchantName:\s*document\.merchantName/);
  assert.match(independentGuard, /date:\s*document\.date/);
  assert.match(independentGuard, /totalAmount:\s*document\.totalAmount/);
  assert.match(independentGuard, /companyId:\s*company\.id/);
  assert.match(independentGuard, approvedCandidatePattern);
  assert.match(independentGuard, /POSSIBLE_DUPLICATE\|/);
});

test("receiptNumber obligation-instance evaluation remains a separate later guard", () => {
  const body = functionSection(
    "export async function approveDetectedDocument(",
    "export async function approveManualReceipt(",
  );

  const transactionGuardStart = body.indexOf('perf("tx company + VAT")');
  assert.ok(transactionGuardStart >= 0, "booking transaction guard marker is required");

  const possibleDuplicate = body.indexOf(
    "const possibleDuplicate =",
    transactionGuardStart,
  );
  assert.ok(possibleDuplicate >= 0, "merchant/date/amount duplicate query is required");

  const receiptNumberGate = body.indexOf(
    "if (document.receiptNumber)",
    transactionGuardStart,
  );
  assert.ok(receiptNumberGate >= 0, "receipt-number duplicate gate is required");
  assert.ok(
    receiptNumberGate > possibleDuplicate,
    "receiptNumber obligation-instance evaluation must remain a later, separate guard",
  );

  const repeatedNumberGuard = body.slice(receiptNumberGate);
  assert.match(repeatedNumberGuard, /receiptNumber:\s*document\.receiptNumber/);
  assert.match(repeatedNumberGuard, approvedCandidatePattern);
  assert.match(repeatedNumberGuard, /readDuplicateIdentityState/);
  assert.match(repeatedNumberGuard, /evaluateDocumentDuplicatePair/);
  assert.match(repeatedNumberGuard, /DUPLICATE_REASON\.RECEIPT_NUMBER_MATCH/);
});
