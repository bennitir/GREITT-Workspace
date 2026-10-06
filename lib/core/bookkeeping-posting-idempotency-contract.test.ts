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

test("detected-document posting atomically claims the document before posting side effects", () => {
  const body = functionSection(
    "export async function approveDetectedDocument(",
    "export async function approveAiSuggestion(",
  );

  const claim = body.indexOf(
    "const postingClaim = await tx.aiDetectedDocument.updateMany",
  );
  assert.ok(claim >= 0, "detected-document posting claim is required");

  const claimBody = body.slice(claim, claim + 900);
  assert.match(claimBody, /approvedAt:\s*null/);
  assert.match(claimBody, /voucherNumber:\s*null/);
  assert.match(claimBody, /data:\s*\{\s*approvedAt/);
  assert.match(claimBody, /postingClaim\.count\s*!==\s*1/);

  const voucherAllocation = body.indexOf('UPDATE "Company"');
  const reservation = body.indexOf("await tx.voucherNumberReservation.create");
  const entries = body.indexOf("await tx.receiptEntry.createMany");
  const audit = body.indexOf("await tx.auditEvent.create");

  assert.ok(voucherAllocation > claim, "claim must precede voucher allocation");
  assert.ok(reservation > claim, "claim must precede voucher reservation");
  assert.ok(entries > claim, "claim must precede ledger entry creation");
  assert.ok(audit > claim, "claim must precede booking audit creation");

  assert.equal(
    (body.match(/const approvedAt = new Date\(\);/g) ?? []).length,
    1,
    "the same approvedAt timestamp must be reused for claim and finalization",
  );
});

test("manual receipt posting atomically claims the receipt before posting side effects", () => {
  const body = functionSection(
    "export async function approveManualReceipt(",
    "function roundVatDeductionAmount(",
  );

  const claim = body.indexOf(
    "const postingClaim = await tx.receipt.updateMany",
  );
  assert.ok(claim >= 0, "manual receipt posting claim is required");

  const claimBody = body.slice(claim, claim + 900);
  assert.match(claimBody, /id:\s*receiptId/);
  assert.match(claimBody, /companyId/);
  assert.match(claimBody, /status:\s*\{\s*not:\s*"APPROVED"\s*\}/);
  assert.match(claimBody, /data:\s*\{\s*status:\s*"APPROVED"/);
  assert.match(claimBody, /postingClaim\.count\s*!==\s*1/);

  const voucherAllocation = body.indexOf('UPDATE "Company"');
  const reservation = body.indexOf("await tx.voucherNumberReservation.create");
  const entries = body.indexOf("await tx.receiptEntry.createMany");
  const audit = body.indexOf("await tx.auditEvent.create");

  assert.ok(voucherAllocation > claim, "claim must precede voucher allocation");
  assert.ok(reservation > claim, "claim must precede voucher reservation");
  assert.ok(entries > claim, "claim must precede ledger entry creation");
  assert.ok(audit > claim, "claim must precede booking audit creation");
});
