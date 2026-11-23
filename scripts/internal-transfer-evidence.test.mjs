import test from 'node:test';
import assert from 'node:assert/strict';
import { oppositeBankAmount, possibleTransferWindow, isPossibleInternalTransfer } from '../lib/personal-finance/internal-transfer-evidence.ts';

test('opposite signed amount uses exact decimal cents', () => {
  assert.equal(oppositeBankAmount('-20000'), '20000');
  assert.equal(oppositeBankAmount('20000.50'), '-20000.50');
  assert.equal(oppositeBankAmount('20000.001'), null);
  assert.equal(oppositeBankAmount('0'), null);
  assert.equal(oppositeBankAmount('unknown'), null);
});
test('calendar-day window includes ±3 days in UTC', () => {
  const range = possibleTransferWindow(new Date('2026-01-02T18:20:00Z'));
  assert.equal(range.from.toISOString(), '2025-12-30T00:00:00.000Z');
  assert.equal(range.toExclusive.toISOString(), '2026-01-06T00:00:00.000Z');
});
test('only another account with opposite exact amount and near date is a candidate', () => {
  const source = {bankAccountId:2, date:new Date('2026-01-02T12:00:00Z'),amount:'-20000'};
  assert.equal(isPossibleInternalTransfer(source,{bankAccountId:3,date:new Date('2026-01-04T10:00:00Z'),amount:'20000'}),true);
  assert.equal(isPossibleInternalTransfer(source,{bankAccountId:2,date:new Date('2026-01-04T10:00:00Z'),amount:'20000'}),false);
  assert.equal(isPossibleInternalTransfer(source,{bankAccountId:3,date:new Date('2026-01-02T10:00:00Z'),amount:'-20000'}),false);
  assert.equal(isPossibleInternalTransfer(source,{bankAccountId:3,date:new Date('2026-01-02T10:00:00Z'),amount:'19999.99'}),false);
  assert.equal(isPossibleInternalTransfer(source,{bankAccountId:3,date:new Date('2026-01-08T10:00:00Z'),amount:'20000'}),false);
});
test('a matching candidate is not a confirmation or classification', () => {
  const result = isPossibleInternalTransfer({ bankAccountId: 1, date:new Date('2026-01-02'), amount:'-1000'},
    { bankAccountId: 2, date:new Date('2026-01-02'), amount:'1000'});
  assert.equal(result,true); // only eligible as possible evidence
});
