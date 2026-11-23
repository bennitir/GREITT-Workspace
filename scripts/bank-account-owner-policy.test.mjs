import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BANK_OWNER_CONFIRM, BANK_OWNER_REVOKE, BANK_OWNER_VERSION,
  latestConfirmedBankAccountOwner, commonConfirmedBankAccountOwner,
} from '../lib/personal-finance/bank-account-owner-policy.ts';
import { readFileSync } from 'node:fs';

const confirmed = (overrides = {}) => ({
  id: 11, companyId: 8, entityType: 'BankAccount', entityId: 2,
  action: BANK_OWNER_CONFIRM, source: 'USER', userId: 4,
  afterData: { version: BANK_OWNER_VERSION, ownerKind: 'COMPANY', ownerId: 8,
    evidenceKind: 'NETBANK', ownershipAttested: true }, ...overrides,
});
const owner = (events, accountId=2, companyId=8) =>
  latestConfirmedBankAccountOwner(events, companyId, accountId);
const pair = (left, right) => commonConfirmedBankAccountOwner(left, right, 8, 2, 13);

test('confirmed bank account owner requires explicit operator and evidence', () => {
  assert.deepEqual(owner([confirmed()]), {
    accountId:2, companyId:8, auditId:11, ownerKind:'COMPANY', ownerId:8, evidenceKind:'NETBANK',
  });
  for (const mutation of [
    { userId:null }, { userId:0 }, { source:'SYSTEM' }, { action:'BANK_OWNER_INFERRED' },
    { companyId:9 }, { entityType:'BankTransaction' }, { entityId:13 },
    { afterData:{...confirmed().afterData, ownershipAttested:false} },
    { afterData:{...confirmed().afterData, evidenceKind:'BANK_TEXT'} },
    { afterData:{...confirmed().afterData, ownerId:999} },
    { afterData:{...confirmed().afterData, ownerKind:'UNKNOWN'} },
    { afterData:{...confirmed().afterData, version:'v0'} },
  ]) {
    assert.equal(owner([confirmed(mutation)]), null, JSON.stringify(mutation));
  }
});

test('later revoke or malformed later confirmation fails closed', () => {
  const revoke={...confirmed({ id:12, action:BANK_OWNER_REVOKE, afterData:{version:BANK_OWNER_VERSION,revoked:true} })};
  assert.equal(owner([confirmed(),revoke]),null);
  assert.equal(owner([revoke,confirmed()]),null);
  const bad = confirmed({id:13, afterData:{ ownerId:8 }});
  assert.equal(owner([confirmed(),bad]),null);
  // unrelated events never override the account owner, even if newer.
  assert.equal(owner([confirmed(), { ...revoke, id:14, action:'UNRELATED' }])?.auditId,11);
});

test('same confirmed canonical owner on two distinct bank accounts allows pairing', () => {
  const a=owner([confirmed()]);
  const b=owner([confirmed({id:17,entityId:13})],13);
  assert.deepEqual(pair(a,b),{ ownerKind:'COMPANY',ownerId:8,evidenceAuditIds:[11,17] });
  assert.equal(pair(a,null),null);
  assert.equal(commonConfirmedBankAccountOwner(a,b,9,2,13),null);
  assert.equal(commonConfirmedBankAccountOwner(a,b,8,2,2),null);
  assert.equal(commonConfirmedBankAccountOwner(a,b,8,13,2),null);
});

test('different people and different owner kinds cannot be combined', () => {
  const a=owner([confirmed({afterData:{...confirmed().afterData,ownerKind:'PRIVATE_PERSON',ownerId:21}})]);
  const b=owner([confirmed({id:17,entityId:13,afterData:{...confirmed().afterData,ownerKind:'PRIVATE_PERSON',ownerId:22}})],13);
  assert.equal(pair(a,b),null);
  const c=owner([confirmed({id:18,entityId:13,afterData:{...confirmed().afterData,ownerKind:'PRIVATE_PERSON',ownerId:21}})],13);
  assert.equal(pair(a,c)?.ownerId,21);
  const companyOwner=owner([confirmed({id:19,entityId:13})],13);
  assert.equal(pair(a,companyOwner),null);
});

test('separate registered-person and transaction identity evidence', () => {
  const src=readFileSync(new URL('../lib/financial-reconciliation/own-account-transfer-service.ts',import.meta.url),'utf8');
  assert.match(src,/assertCommonConfirmedBankAccountOwner\(/);
  assert.match(src,/verifiedAccountOwner:/);
  assert.match(src,/await requireNoOtherClaims\(/);
  const registration=readFileSync(new URL('../lib/financial-reconciliation/bank-account-owner-service.ts',import.meta.url),'utf8');
  assert.match(registration,/FOR UPDATE/);
  assert.match(registration,/TransactionIsolationLevel\.Serializable/);
  assert.match(registration,/registeredPrivatePersonCategory/);
  assert.match(registration,/BANK_OWNER_REVOKE/);
  assert.match(registration,/companyId, entityType: 'BankAccount', entityId: bankAccountId/);
  assert.doesNotMatch(registration,/ReceiptEntry|createJournal/);
});

test('re-confirmation after revocation needs a fresh evidence event', () => {
  const revoked = confirmed({ id:12, action:BANK_OWNER_REVOKE,
    afterData:{ version:BANK_OWNER_VERSION, revoked:true } });
  const reconfirmed = confirmed({ id:15, afterData: { ...confirmed().afterData,
    evidenceKind:'BANK_STATEMENT' } });
  assert.equal(owner([confirmed(),revoked]),null);
  assert.equal(owner([confirmed(),revoked,reconfirmed])?.auditId,15);
  assert.equal(owner([confirmed(),revoked,reconfirmed])?.evidenceKind,'BANK_STATEMENT');
});

test('write actions demand owner/admin authorization; confirmation checks owner before creating reconciliation', () => {
  const actions=readFileSync(new URL('../app/banki/[id]/afstemming/internal-transfer-actions.ts',import.meta.url),'utf8');
  assert.match(actions,/confirmBankAccountOwnerAction\([\s\S]*?authorizedOwnTransferWrite\(\)/);
  assert.match(actions,/revokeBankAccountOwnerAction\([\s\S]*?authorizedOwnTransferWrite\(\)/);
  assert.match(actions,/access\.role !== 'OWNER' && access\.role !== 'ADMIN'/);
  const service=readFileSync(new URL('../lib/financial-reconciliation/own-account-transfer-service.ts',import.meta.url),'utf8');
  const assertPos=service.indexOf('const accountOwner = await assertCommonConfirmedBankAccountOwner(');
  const createPos=service.indexOf('const created = await tx.financialReconciliation.create(');
  assert.ok(assertPos > 0 && createPos > assertPos);
});
