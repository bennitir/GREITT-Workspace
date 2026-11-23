import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import {
  resolveRegisteredBankOwner,
  commonRegisteredBankOwner,
  BANK_OWNER_CONFIRM,
  BANK_OWNER_REVOKE,
  BANK_OWNER_VERSION,
} from '../lib/personal-finance/bank-account-owner-policy.ts';

const companyId = 8;
const entry = (accountId, id, kind='COMPANY', ownerId=companyId) => ({
  id, companyId, entityType:'BankAccount', entityId:accountId,
  action:BANK_OWNER_CONFIRM, source:'USER', userId:100,
  afterData:{version:BANK_OWNER_VERSION,ownerKind:kind,ownerId,evidenceKind:'NETBANK',ownershipAttested:true},
});
const match = (left, right, c=companyId, a=2, b=13) => commonRegisteredBankOwner(left,right,c,a,b);

test('two active accounts registered under one company need no repeated owner confirmation', () => {
  const left=resolveRegisteredBankOwner(null,companyId,2);
  const right=resolveRegisteredBankOwner(null,companyId,13);
  const result=match(left,right);
  assert.equal(result?.ownerKind,'COMPANY');
  assert.equal(result?.ownerId,companyId);
  assert.equal(result?.basis,'COMPANY_ACCOUNT_REGISTRATION');
  assert.deepEqual(result?.evidenceAuditIds,[]);
});

test('one company owner confirmation and one registered company account can match', () => {
  const left=resolveRegisteredBankOwner(entry(2,11),companyId,2);
  const right=resolveRegisteredBankOwner(null,companyId,13);
  assert.deepEqual(match(left,right)?.evidenceAuditIds,[11]);
});

test('two existing matching private owner records can match without repeat confirmation',()=>{
  const left=resolveRegisteredBankOwner(entry(2,11,'PRIVATE_PERSON',45),companyId,2);
  const right=resolveRegisteredBankOwner(entry(13,12,'PRIVATE_PERSON',45),companyId,13);
  assert.equal(match(left,right)?.ownerId,45);
});

test('an explicit private owner is not silently equated with a registered company account',()=>{
  const left=resolveRegisteredBankOwner(entry(2,11,'PRIVATE_PERSON',45),companyId,2);
  assert.equal(match(left,resolveRegisteredBankOwner(null,companyId,13)),null);
});

test('different private owners are never treated as matching',()=>{
  const left=resolveRegisteredBankOwner(entry(2,11,'PRIVATE_PERSON',45),companyId,2);
  const right=resolveRegisteredBankOwner(entry(13,12,'PRIVATE_PERSON',46),companyId,13);
  assert.equal(match(left,right),null);
});

test('explicit owner revocation blocks automatic company registration fallback',()=>{
  const revoked={...entry(13,19),action:BANK_OWNER_REVOKE,afterData:{version:BANK_OWNER_VERSION,revoked:true}};
  assert.equal(resolveRegisteredBankOwner(revoked,companyId,13),null);
  assert.equal(match(resolveRegisteredBankOwner(null,companyId,2), resolveRegisteredBankOwner(revoked,companyId,13)),null);
});

test('invalid newer owner record blocks fallback',()=>{
  const bad={...entry(2,22),afterData:{version:'bad',ownerKind:'COMPANY',ownerId:companyId}};
  assert.equal(resolveRegisteredBankOwner(bad,companyId,2),null);
});

test('cross-company audit cannot be used as ownership of account',()=>{
  assert.equal(resolveRegisteredBankOwner(entry(2,11),9,2),null);
  const l=resolveRegisteredBankOwner(null,8,2),r=resolveRegisteredBankOwner(null,9,13);
  assert.equal(match(l,r),null);
});

test('same account cannot be paired with itself',()=>{
  const left=resolveRegisteredBankOwner(null,8,2);
  assert.equal(commonRegisteredBankOwner(left,left,8,2,2),null);
});

test('UI has no second netbank oath and write service still rechecks under transaction',()=>{
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const ui=readFileSync(resolve(root,'app/banki/[id]/afstemming/BankFlowReviewPanel.tsx'),'utf8');
  const svc=readFileSync(resolve(root,'lib/financial-reconciliation/own-account-transfer-service.ts'),'utf8');
  const owners=readFileSync(resolve(root,'lib/financial-reconciliation/bank-account-owner-service.ts'),'utf8');
  const actions=readFileSync(resolve(root,'app/banki/[id]/afstemming/internal-transfer-actions.ts'),'utf8');
  assert.doesNotMatch(ui,/setOwnershipAttested|ownerConfirmAction|ownerRevokeAction/);
  assert.match(ui,/disabled=\{!accountOwnersMatch \|\| !confirmEnabled \|\| pending\}/);
  assert.match(actions,/ownershipAttested: true/); // explicit operator click; no checkbox
  assert.match(svc,/await assertCommonConfirmedBankAccountOwner\(/);
  assert.match(svc,/isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(owners,/FOR UPDATE/);
  assert.match(svc,/await requireNoOtherClaims\(/);
  assert.match(actions,/ownTransferScopedStorageEnabled\(/);
});
