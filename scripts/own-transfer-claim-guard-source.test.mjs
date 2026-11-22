import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../lib/financial-reconciliation/own-account-transfer-service.ts', import.meta.url), 'utf8');
test('Textavörn: samþykkt og óafgreidd afstemming hindra, einungis VOID undanþegið', () => {
  assert.match(source, /reconciliation: \{ companyId, status: \{ not: 'VOID' \}/);
  assert.doesNotMatch(source, /reconciliation: \{ companyId, status: 'CONFIRMED'/);
});
test('Textavörn: án claim-töflu má ekki skrifa í Production', () => {
  assert.match(source, /!claimTable\[0\]\.present && !ownTransferStorageEnabled\(\)/);
  assert.match(source, /throw new Error\('CLAIM_GUARD_MISSING'\)/);
});
test('Textavörn: bankalæsing og raðeinangrun óbreytt', () => {
  assert.equal((source.match(/FOR UPDATE/g)||[]).length, 2);
  assert.equal((source.match(/Prisma.TransactionIsolationLevel.Serializable/g)||[]).length, 2);
});
test('Textavörn: handvirkt eignarhald og aðgerðasaga enn skilyrði', () => {
  assert.match(source, /if \(!input\.ownershipAttested\)/);
  assert.match(source, /action: 'CONFIRM_BANK_TO_BANK_OWN_TRANSFER'/);
  assert.match(source, /action: 'VOID_BANK_TO_BANK_OWN_TRANSFER'/);
});
