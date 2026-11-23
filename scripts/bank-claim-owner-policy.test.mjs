import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  claimForFinancialEventPayment, claimForReconciliation,
  claimForFamilyLedger, identicalBankClaim,
} from '../lib/financial-reconciliation/bank-claim-owner-policy.ts';
const sql = readFileSync(new URL('../docs/architecture/bank-claim-stage1-TRIAL-ROLLBACK.sql',import.meta.url),'utf8');

test('FinancialEventPayment and its reconciliation share one canonical owner',()=>{
  const p=claimForFinancialEventPayment(8,330);
  const r=claimForReconciliation({companyId:8,bankTransactionId:330,reconciliationId:999,reconciliationType:'BANK_TO_FINANCIAL_EVENT'});
  assert.ok(identicalBankClaim(p,r));
});
test('different events can share the same PAYMENT LEDGER owner (database caps amounts)',()=>{
  const a=claimForReconciliation({companyId:8,bankTransactionId:330,reconciliationId:5,reconciliationType:'BANK_TO_FINANCIAL_EVENT'});
  const b=claimForReconciliation({companyId:8,bankTransactionId:330,reconciliationId:6,reconciliationType:'BANK_TO_FINANCIAL_EVENT'});
  assert.ok(identicalBankClaim(a,b));
});
test('own transfers use one reconciliation claim per bank line',()=>{
  const a=claimForReconciliation({companyId:8,bankTransactionId:330,reconciliationId:51,reconciliationType:'BANK_TO_BANK_OWN_TRANSFER'});
  const b=claimForReconciliation({companyId:8,bankTransactionId:1801,reconciliationId:51,reconciliationType:'BANK_TO_BANK_OWN_TRANSFER'});
  assert.equal(a.family,'RECONCILIATION'); assert.equal(a.ownerKey,'51');
  assert.equal(b.ownerKey,'51'); assert.ok(!identicalBankClaim(a,b));
});
test('other reconciliation cannot reuse a bank line',()=>{
  const a=claimForReconciliation({companyId:8,bankTransactionId:330,reconciliationId:51,reconciliationType:'BANK_TO_BANK_OWN_TRANSFER'});
  const b=claimForReconciliation({companyId:8,bankTransactionId:330,reconciliationId:52,reconciliationType:'BANK_TO_DOCUMENT_SET'});
  assert.ok(!identicalBankClaim(a,b));
});
test('payment and own-transfer on same movement collide',()=>{
  const a=claimForFinancialEventPayment(8,330);
  const b=claimForReconciliation({companyId:8,bankTransactionId:330,reconciliationId:52,reconciliationType:'BANK_TO_BANK_OWN_TRANSFER'});
  assert.ok(!identicalBankClaim(a,b));
});
test('family and ordinary claims collide',()=>{
  assert.ok(!identicalBankClaim(claimForFinancialEventPayment(8,330),claimForFamilyLedger(8,330)));
});
test('claim never crosses company or bank line',()=>{
  assert.ok(!identicalBankClaim(claimForFinancialEventPayment(8,330),claimForFinancialEventPayment(9,330)));
  assert.ok(!identicalBankClaim(claimForFinancialEventPayment(8,330),claimForFinancialEventPayment(8,1801)));
});
test('invalid or unsafe IDs are rejected',()=>{
  for(const n of [0,-1,1.5,Infinity,Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>claimForFinancialEventPayment(8,n),/INVALID_CLAIM_ID/);
  }
});
test('stage1 SQL preview always rolls back and never asserts readiness',()=>{
  assert.match(sql,/\bBEGIN\s*;/i);
  assert.match(sql,/\bROLLBACK\s*;\s*$/i);
  assert.doesNotMatch(sql,/gloggt_bank_claim_guard_ready_v1\s*\(/i);
  assert.doesNotMatch(sql,/\bCOMMIT\s*;/i);
});
test('stage1 prototype has unique bank line and RLS',()=>{
  assert.match(sql,/UNIQUE\s*\(\s*"bankTransactionId"\s*\)/i);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/i);
  assert.match(sql,/REVOKE ALL ON .*"BankAllocationClaim" FROM PUBLIC/i);
});
test('triggers examine both confirmed payment and reconciliation representations',()=>{
  assert.match(sql,/AFTER INSERT OR UPDATE ON public\."FinancialEventPayment"/i);
  assert.match(sql,/AFTER INSERT OR UPDATE ON public\."FinancialReconciliationParticipant"/i);
  assert.match(sql,/AFTER UPDATE OF "status" ON public\."FinancialReconciliation"/i);
  assert.match(sql,/EVENT_PAYMENT_LEDGER/);
});
test('confirmed payments aggregate exact NUMERIC and lock bank row in SQL trial',()=>{
  assert.match(sql,/FOR UPDATE OF b/i);
  assert.match(sql,/COALESCE\s*\(SUM\("amount"\),\s*0\)/i);
  assert.match(sql,/abs\(v_amount\)/i);
});
