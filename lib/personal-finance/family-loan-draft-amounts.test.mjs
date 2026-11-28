import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseIskAmount, parseBankDebitIsk, previewFamilyLoanAllocation } from './family-loan-draft-amounts.ts';

test('draft accepts ungrouped whole ISK and correctly grouped Icelandic amounts', () => {
  for (const [text, expected] of [
    ['0', 0], ['01', 1], ['1000', 1000], ['1.000', 1000],
    ['12.345.678', 12345678], ['1 000', 1000],
    ['1\u00a0000', 1000], ['1\u202f000', 1000], [' 12.345 ', 12345],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
  ]) assert.equal(parseIskAmount(text), expected, text);
});

test('draft rejects malformed separators before stripping them', () => {
  for (const text of [
    '1 2', '1..2', '1.2', '1.00', '12 34', '1 0000', '1.0000',
    '1 000.000', '1.000 000', '1,000', '1e3', '1\t000',
    '-1', '+1', '9007199254740992',
  ]) assert.throws(() => parseIskAmount(text), undefined, text);
});

test('draft preserves blank-as-zero semantics only when requested', () => {
  assert.equal(parseIskAmount('', true), 0);
  assert.equal(parseIskAmount('  ', true), 0);
  assert.throws(() => parseIskAmount(''));
});

test('draft preview does not invent allocations for malformed money', () => {
  assert.deepEqual(previewFamilyLoanAllocation(10000, ['1 000', '500'], 'OVER_LIMIT'),
    { allocatedIsk: 1500, remainingIsk: 8500, error: null });
  const bad = previewFamilyLoanAllocation(10000, ['1 2'], 'OVER_LIMIT');
  assert.equal(bad.allocatedIsk, null);
  assert.equal(bad.remainingIsk, null);
  assert.ok(bad.error);
});

test('bank-debit input still requires a negative whole-ISK amount', () => {
  assert.equal(parseBankDebitIsk('-1000'), 1000);
  assert.equal(parseBankDebitIsk('-1000.00'), 1000);
  assert.throws(() => parseBankDebitIsk('1000'));
});
