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
  assert.match(actions, /latestConfirmedBankAccountOwner/);
  assert.match(actions, /commonConfirmedBankAccountOwner/);
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
test('ownership controls wired only through existing bank-flow review', () => {
  assert.match(page, /ownerReviewAction: reviewBankAccountOwnersAction/);
  assert.match(page, /ownerConfirmAction: confirmBankAccountOwnerAction/);
  assert.match(page, /ownerRevokeAction: revokeBankAccountOwnerAction/);
  assert.match(workspace, /ownerReviewAction=\{transferReview\.ownerReviewAction\}/);
  assert.match(flow, /<BankAccountOwnerPanel/);
  assert.match(flow, /!accountOwnersMatch/);
});
test('UI never treats matching amounts as proof and keeps user confirmation', () => {
  assert.match(ui, /reviewAction\(sourceAccountId, targetAccountId\)/);
  assert.match(ui, /onPairableChange\(next\.ok && next\.sameOwner\)/);
  assert.match(ui, /ownership not verified|Eignarhald ekki staðfest/i);
  assert.match(ui, /attested/);
  assert.match(ui, /revokeAction/);
  assert.match(flow, /ownershipAttested/);
});
