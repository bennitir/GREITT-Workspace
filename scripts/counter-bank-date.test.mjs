import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCounterBankDate } from '../app/banki/[id]/afstemming/format-counter-bank-date.ts';

test('íslensk dagsetning mótfærslu birtist dd.mm.yyyy', () => {
  assert.equal(formatCounterBankDate('2026-01-02', 'is'), '02.01.2026');
  assert.equal(formatCounterBankDate('2026-01-02T00:00:00.000Z', 'is'), '02.01.2026');
});
test('önnur tungumál nota eigið birtingarsnið', () => {
  assert.equal(formatCounterBankDate('2026-01-02', 'en'), '02/01/2026');
  assert.equal(formatCounterBankDate('2026-01-02', 'pl'), '02.01.2026');
  assert.equal(formatCounterBankDate('2026-01-02', 'sr'), '02.01.2026');
});
test('ógildar dagsetningar eru ekki giskaðar', () => {
  assert.equal(formatCounterBankDate('2026-02-31', 'is'), '2026-02-31');
  assert.equal(formatCounterBankDate('unknown', 'is'), 'unknown');
});
