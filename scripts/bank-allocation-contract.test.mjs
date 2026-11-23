import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bankAllocationContractFailure } from '../lib/financial-reconciliation/bank-allocation-contract-policy.ts';

const ready = { tablePresent: true, rlsEnabled: true,
                uniqueBankTransaction: true, verifierPresent: true };

test('bare table cannot authorize Production', () => {
  assert.equal(bankAllocationContractFailure({ ...ready, rlsEnabled: false,
    uniqueBankTransaction: false, verifierPresent: false }, null), 'CLAIM_RLS_MISSING');
});
test('missing table always stops even with a hypothetical verifier', () => {
  assert.equal(bankAllocationContractFailure({...ready, tablePresent:false},true),'CLAIM_TABLE_MISSING');
});
test('missing RLS always stops', () => {
  assert.equal(bankAllocationContractFailure({...ready, rlsEnabled:false},true),'CLAIM_RLS_MISSING');
});
test('missing UNIQUE bank line always stops', () => {
  assert.equal(bankAllocationContractFailure({...ready, uniqueBankTransaction:false},true),'CLAIM_UNIQUENESS_MISSING');
});
test('missing versioned DB verifier always stops', () => {
  assert.equal(bankAllocationContractFailure({...ready, verifierPresent:false},true),'CLAIM_VERIFIER_MISSING');
});
test('present but rejecting verifier stops', () => {
  assert.equal(bankAllocationContractFailure(ready,false),'CLAIM_VERIFIER_REJECTED');
  assert.equal(bankAllocationContractFailure(ready,null),'CLAIM_VERIFIER_REJECTED');
});
test('all schema evidence AND verified DB-side contract required', () => {
  assert.equal(bankAllocationContractFailure(ready,true),null);
});
test('OWN: guard cannot be bypassed in non-V03 path', () => {
  const source = readFileSync(new URL('../lib/financial-reconciliation/own-account-transfer-service.ts',import.meta.url),'utf8');
  assert.match(source,/if \(!ownTransferStorageEnabled\(\)\) await assertVerifiedBankAllocationContract\(tx\)/);
  assert.match(source,/if \(!claimTable\[0\]\.present && !ownTransferStorageEnabled\(\)\)/);
});
test('DOCUMENT SET: confirms and voids require the contract in Production', () => {
  const source = readFileSync(new URL('../lib/financial-reconciliation/document-set-service.ts',import.meta.url),'utf8');
  assert.equal((source.match(/if \(process\.env\.VERCEL_ENV === 'production'\) await assertVerifiedBankAllocationContract\(tx\)/g)||[]).length,2);
});
test('No writes nor schema changes in shared verifier', () => {
  const source = readFileSync(new URL('../lib/financial-reconciliation/bank-allocation-contract.ts',import.meta.url),'utf8');
  assert.match(source,/pg_catalog\.pg_index/);
  assert.match(source,/gloggt_bank_claim_guard_ready_v1/);
  assert.doesNotMatch(source,/\b(?:INSERT|UPDATE|DELETE|CREATE TABLE|ALTER TABLE)\s+/i);
});
