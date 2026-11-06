'use strict';
// Isolated, synthetic read projection tests. No DB credentials or network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'lib/financial-reconciliation/existing-confirmed-bank-documents.ts'), 'utf8');
const page = fs.readFileSync(path.join(root, 'app/banki/[id]/afstemming/page.tsx'), 'utf8');
const component = fs.readFileSync(path.join(root, 'app/banki/[id]/afstemming/VisualReconciliationWorkspace.tsx'), 'utf8');
const trans = fs.readFileSync(path.join(root, 'app/banki/_lib/i18n/visual-reconciliation-text.ts'), 'utf8');

function load(mockPrisma) {
  const exports = {};
  const { outputText, diagnostics } = ts.transpileModule(source, {
    fileName: 'existing-confirmed-bank-documents.ts',
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  assert.deepEqual((diagnostics || []).filter(x => x.category === ts.DiagnosticCategory.Error), []);
  vm.runInNewContext(outputText, { exports, require: id => {
    if (id === 'server-only') return {};
    if (id === '@/lib/prisma') return { prisma: mockPrisma };
    throw Error(`UNEXPECTED_IMPORT:${id}`);
  }, Map, Set, Date, Number, String });
  return exports;
}

const confirmedFixture = [{
  id: 105,
  reconciliationType: 'BANK_TO_REVIEWED_DOCUMENT',
  confirmedAt: new Date('2026-01-03T12:00:00.000Z'),
  confirmedByUserId: 6,
  // Historical records may use different role names: sourceType+sourceKey are decisive.
  participants: [
    { sourceType: 'BANK_TRANSACTION', sourceKey: '328' },
    { sourceType: 'AI_DETECTED_DOCUMENT', sourceKey: '282' },
  ],
}, {
  id: 108,
  reconciliationType: 'BANK_TO_REVIEWED_DOCUMENT',
  confirmedAt: null,
  confirmedByUserId: null,
  participants: [
    { sourceType: 'BANK_TRANSACTION', sourceKey: '329' },
    { sourceType: 'AI_DETECTED_DOCUMENT', sourceKey: '383' },
  ],
}];

function mock(calls) {
  return {
    bankTransaction: { findMany: async args => {
      calls.push(['bank', args]);
      return [{ id: 328 }, { id: 329 }].filter(row => args.where.id.in.includes(row.id));
    } },
    financialReconciliation: { findMany: async args => {
      calls.push(['reconciliations', args]);
      return confirmedFixture.filter(record => record.participants.some(p =>
        p.sourceType === 'BANK_TRANSACTION' && args.where.participants.some.sourceKey.in.includes(p.sourceKey)));
    } },
    aiDetectedDocument: { findMany: async args => {
      calls.push(['documents', args]);
      return [{ id: 282, receiptId: 86, merchantName: 'GERVI SJÓVÁ', totalAmount: 89146, receipt: { merchantName: 'GERVI SJÓVÁ' } }]
        .filter(doc => args.where.id.in.includes(doc.id));
    } },
  };
}

test('confirmed legacy #105 with explicit #328 -> #282 is displayed; unrelated suggestions are not inferred', async () => {
  const calls = [];
  const result = await load(mock(calls)).getExistingConfirmedBankDocuments(8, 2, [328]);
  assert.equal(result.ok, true);
  assert.equal(result.reconciliations.length, 1);
  const link = result.reconciliations[0];
  assert.equal(link.id, 105);
  assert.equal(link.bankTransactionId, 328);
  assert.equal(link.documents[0].documentId, 282);
  assert.equal(link.documents[0].receiptId, 86);
  assert.equal(link.documents[0].amount, '89146');
  assert.equal(link.confirmedByUserId, 6);
  assert.equal(calls[0][1].where.bankAccountId, 2);
  assert.equal(calls[0][1].where.bankAccount.companyId, 8);
  assert.equal(calls[1][1].where.companyId, 8);
  assert.equal(calls[1][1].where.status, 'CONFIRMED');
  assert.equal(calls[1][1].where.reconciliationType, 'BANK_TO_REVIEWED_DOCUMENT');
  assert.equal(calls[1][1].where.participants.some.role, undefined, 'legacy roles must not hide existing explicit links');
  assert.equal(calls[2][1].where.receipt.companyId, 8);
});

test('missing old document remains visible as a missing source; never reconstructs a link', async () => {
  const result = await load(mock([])).getExistingConfirmedBankDocuments(8, 2, [329]);
  assert.equal(result.reconciliations.length, 1);
  assert.equal(result.reconciliations[0].id, 108);
  assert.equal(result.reconciliations[0].documents[0].documentId, 383);
  assert.equal(result.reconciliations[0].documents[0].sourceMissing, true);
  assert.equal(result.reconciliations[0].documents[0].receiptId, null);
});

test('invalid scope, absent rows and query errors fail closed, without writes', async () => {
  const calls = [];
  const reader = load(mock(calls)).getExistingConfirmedBankDocuments;
  assert.equal((await reader(8, 2, [0])).ok, false);
  assert.equal((await reader(0, 2, [328])).ok, false);
  assert.deepEqual(calls, []);
  assert.equal((await reader(8, 2, [])).ok, true);
  assert.deepEqual(calls, []);
  const failed = await load({ bankTransaction: { findMany: async () => { throw Error('unavailable'); } } })
    .getExistingConfirmedBankDocuments(8, 2, [328]);
  assert.equal(failed.ok, false);
  assert.equal(failed.reconciliations.length, 0);
  assert.doesNotMatch(source, /\.create\(|\.update\(|\.delete\(|\.upsert\(|\$executeRaw|\$queryRaw/);
});

test('page only passes read-only data to scoped visual view; UI opens original via existing authorized endpoint', () => {
  assert.match(page, /getExistingConfirmedBankDocuments\(activeCompanyId, bankAccountId, model\.transactions\.map\(row => row\.id\)\)/);
  assert.match(page, /historicalEvidenceUnavailable=\{!existingConfirmedRead\.ok\}/);
  assert.match(component, /existingConfirmedReconciliations\.filter\(row => row\.bankTransactionId === selected\.id\)/);
  assert.match(component, /data-testid=\{`existing-reconciliation-\$\{group\.id\}`\}/);
  assert.match(component, /openDocument\(document\.receiptId!, document\.documentId\)/);
  assert.match(component, /selected\.bankStatus === 'UNRECONCILED'/);
  assert.match(component, /document\.sourceMissing/);
  for (const language of ['is','en','pl','sr']) {
    assert.match(trans, new RegExp(`${language}: \\{[\\s\\S]*?existingConfirmedTitle:`));
  }
});
