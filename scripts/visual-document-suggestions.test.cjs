// Synthetic deterministic suggestions. Read-only; no database or network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const helperFile = path.join(root, 'app/banki/_lib/visual-document-suggestions.ts');
const uiFile = path.join(root, 'app/banki/[id]/afstemming/VisualReconciliationWorkspace.tsx');
const i18nFile = path.join(root, 'app/banki/_lib/i18n/visual-reconciliation-text.ts');
const src = fs.readFileSync(helperFile, 'utf8');
const transpile = (source, fileName) => ts.transpileModule(source, { fileName, reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
const transpiled = transpile(src, helperFile);
assert.equal(transpiled.diagnostics?.length ?? 0, 0);
const moduleBox = { exports: {} };
vm.runInNewContext(transpiled.outputText, { module: moduleBox, exports: moduleBox.exports, BigInt, Date, Set, Infinity, Number, String });
const { visualMerchantAnchor, fallbackAnchorForBankQuery, rankVisualDocumentsForBank } = moduleBox.exports;
const bank = { text: 'Sjóvá-Almennar líftrygging', amount: '-901', date: '2026-01-02T00:00:00.000Z' };
const hit = (id, title, amount, date) => ({ receiptId:id, documentId:id, title, amount, date, reference:null, voucherNumber:null });
const docs = [
  hit(367,'Sjóvá-Almennar tryggingar hf.','900','2026-03-01T00:00:00Z'),
  hit(334,'Sjóvá-Almennar tryggingar hf.','89144','2026-01-03T00:00:00Z'),
  hit(333,'Sjóvá-Almennar tryggingar hf.','901','2026-02-02T00:00:00Z'),
  hit(328,'Sjóvá-Almennar tryggingar hf.','901','2026-01-02T00:00:00Z'),
];
test('bank text uses vendor anchor, not an impossible full-text phrase', () => {
  assert.equal(visualMerchantAnchor(bank.text), 'Sjóvá');
  assert.equal(visualMerchantAnchor('Greiðsla Sjóvá-Almennar tryggingar'), 'Sjóvá');
  assert.equal(visualMerchantAnchor(''), null);
});
test('unmatched bank insurance term widens only against same selected bank description', () => {
  assert.equal(fallbackAnchorForBankQuery(bank.text, 'Sjóvá-Almennar líftrygging'), 'Sjóvá');
  assert.equal(fallbackAnchorForBankQuery(bank.text, 'líftrygging'), 'Sjóvá');
  assert.equal(fallbackAnchorForBankQuery(bank.text, 'Landsbankinn'), null);
  assert.equal(fallbackAnchorForBankQuery(bank.text, 'Sjóvá'), null);
});
test('901 ISK receipt on same date ranks first, without asserting a confirmed match', () => {
  const ranked = rankVisualDocumentsForBank(bank, docs);
  assert.equal(ranked[0].item.documentId, 328);
  assert.equal(ranked[0].sameAmount, true);
  assert.equal(ranked[0].closeDate, true);
  assert.equal(ranked.find(row => row.item.documentId === 334).sameAmount, false);
});
test('never equate rounded amounts or large near numbers', () => {
  const ranked = rankVisualDocumentsForBank(bank, [hit(1,'Sjóvá','901.009','2026-01-02T00:00:00Z'), hit(2,'Sjóvá','900','2026-01-02T00:00:00Z')]);
  assert.equal(ranked.every(row => row.sameAmount === false), true);
});
test('suggestions use the existing server-authorized lookup; comparison remains manual', () => {
  const ui = fs.readFileSync(uiFile,'utf8');
  const result = transpile(ui,uiFile);
  assert.equal(result.diagnostics?.length ?? 0, 0);
  assert.match(ui, /data-testid="suggest-documents-from-bank"/);
  assert.match(ui, /documentSearchAction\(model\.bankAccountId, anchor\)/);
  assert.match(ui, /rankVisualDocumentsForBank\(selected,/);
  assert.match(ui, /onClick=\{\(\) => toggleComparison\(item\)\}/);
  assert.doesNotMatch(ui, /setGroupReviewed\(/);
});
test('all four languages label tentative suggestions and broadened search', () => {
  const str = fs.readFileSync(i18nFile, 'utf8');
  for (const key of ['suggestClickHint', 'suggestTitle', 'suggestSearchFor', 'suggestNotProof',
    'suggestSameAmount', 'suggestNearDate', 'suggestBroadenedSearch']) {
    assert.equal((str.match(new RegExp('\\b'+key+':', 'g')) ?? []).length, 4, key);
  }
});
