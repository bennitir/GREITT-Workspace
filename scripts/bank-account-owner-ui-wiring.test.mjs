import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const actions = read('app/banki/[id]/afstemming/internal-transfer-actions.ts');
const workspace = read('app/banki/[id]/afstemming/VisualReconciliationWorkspace.tsx');
const page = read('app/banki/[id]/afstemming/page.tsx');
const flow = read('app/banki/[id]/afstemming/BankFlowReviewPanel.tsx');
const ui = read('app/banki/[id]/afstemming/BankAccountOwnerPanel.tsx');

test('bank-account owner read checks tenant and distinct accounts', () => {
  assert.match(actions, /sourceBankAccountId === targetBankAccountId/);
  assert.match(actions, /companyId: auth\.companyId, isActive: true/);
  assert.match(actions, /registeredPrivatePersonCategory/);
  // The newest explicit owner decision is read; ordinary company registration remains sufficient.
  assert.match(actions, /BANK_OWNER_CONFIRM, BANK_OWNER_REVOKE/);
  assert.match(actions, /orderBy: \{ id: 'desc' \}/);
  assert.match(actions, /resolveRegisteredBankOwner/);
  assert.match(actions, /commonRegisteredBankOwner/);
});
test('owner writes fail closed when own-transfer scope is disabled', () => {
  for (const name of ['confirmBankAccountOwnerAction', 'revokeBankAccountOwnerAction']) {
    const start = actions.indexOf(`export async function ${name}`);
    assert.ok(start >= 0, name);
    const end = actions.indexOf(String.fromCharCode(10) + '}', start);
    assert.ok(end > start, name);
    const block = actions.slice(start, end + 2);
    assert.match(block, /ownTransferAccountReady\(process\.env/);
    assert.match(block, /STORAGE_DISABLED/);
  }
});
test('registered-owner review wired into existing bank-flow review without an extra owner form', () => {
  assert.match(page, /ownerReviewAction: reviewBankAccountOwnersAction/);
  assert.match(page, /confirmAction: confirmOwnTransferAction/);
  assert.match(page, /voidAction: voidOwnTransferAction/);
  assert.doesNotMatch(page, /ownerConfirmAction:|ownerRevokeAction:/);
  assert.match(workspace, /ownerReviewAction=\{transferReview\.ownerReviewAction\}/);
  assert.match(flow, /<BankAccountOwnerPanel/);
  assert.match(flow, /reviewAction=\{ownerReviewAction\}/);
  assert.match(flow, /!accountOwnersMatch/);
});
test('UI requires successful registered-owner review AND an explicit confirmation click', () => {
  assert.match(ui, /reviewAction\(sourceAccountId, targetAccountId\)/);
  assert.match(ui, /onPairableChange\(false\)/);
  assert.match(ui, /onPairableChange\(value\.ok && value\.sameOwner\)/);
  assert.match(ui, /!review\.ok/);
  assert.match(ui, /review\?\.ok && review\.sameOwner/);
  assert.match(ui, /Pörun er læst|Pairing is locked/);
  assert.match(flow, /if \(!confirmEnabled \|\| !chosenId \|\| !accountOwnersMatch \|\| saved\) return/);
  assert.match(flow, /<button type="button" onClick=\{confirmSelected\} disabled=\{!accountOwnersMatch \|\| !confirmEnabled \|\| pending\}/);
  assert.match(flow, /await confirmAction\(bankAccountId, bankTransactionId, chosenId\)/);
  assert.doesNotMatch(ui, /revokeAction|confirmBankAccountOwnerAction/);
});
