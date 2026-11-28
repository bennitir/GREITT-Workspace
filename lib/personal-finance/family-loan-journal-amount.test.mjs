import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseStoredFamilyLoanAmountIsk as parse, parseEnteredFamilyLoanAmountIsk as parseEntered } from './family-loan-journal-amount.ts';

test('canonical stored whole-ISK values are preserved without rounding', () => {
  assert.equal(parse('1'), 1);
  assert.equal(parse('1000'), 1000);
  assert.equal(parse('9007199254740991'), Number.MAX_SAFE_INTEGER);
});

test('rejects ambiguous and malformed stored amounts rather than coercing them', () => {
  for (const value of ['0','-1','01','1e3','1E3','0x20','0b10',
    '1.0','1.00','1,000',' 1','1 ','+1','','NaN','Infinity','9007199254740992']) {
    assert.throws(() => parse(value), { message: 'FAMILY_JOURNAL_AMOUNT_INVALID' }, value);
  }
});

test('rejects loss of integer precision', () => {
  assert.throws(() => parse('99999999999999999999'), {
    message: 'FAMILY_JOURNAL_AMOUNT_INVALID',
  });
});

test('accepts positive ISK input with correct Icelandic thousands grouping', () => {
  for (const [raw, expected] of [
    ['1', 1], ['1000', 1000], ['1.000', 1000], ['1.000.000', 1000000],
    ['1 000', 1000], ['1\u00a0000', 1000], ['1\u202f000', 1000],
    [' 12.345 ', 12345], ['9007199254740991', Number.MAX_SAFE_INTEGER],
  ]) assert.equal(parseEntered(raw), expected, raw);
});

test('rejects malformed, ambiguous and out-of-range user-entered money', () => {
  for (const raw of [
    '', '0', '-1', '+1', '01', '001', '1..2', '1.2', '1.00',
    '1 2', '10.00', '100.00', '1.0000', '1.000 000',
    '1e3', '0x20', '1,000', '1.000,00', '1\t000',
    '9007199254740992', '999999999999999999999',
  ]) assert.equal(parseEntered(raw), null, raw);
});
