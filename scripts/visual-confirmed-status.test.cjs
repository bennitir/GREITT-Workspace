'use strict';
// Synthetic read-model tests; no Supabase, production connection or network calls.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const helperSource = fs.readFileSync(path.join(root, 'lib/financial-reconciliation/visual-confirmed-document-links.ts'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'app/banki/[id]/afstemming/VisualReconciliationWorkspace.tsx'), 'utf8');
const languages = fs.readFileSync(path.join(root, 'app/banki/_lib/i18n/visual-reconciliation-text.ts'), 'utf8');
function getHelper() {
  const compiled = ts.transpileModule(helperSource, { fileName: 'visual-confirmed-document-links.ts', compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }});
  const exports = {};
  vm.runInNewContext(compiled.outputText, { exports, require: x => { throw Error('Unexpected runtime dependency: ' + x); }, Map, Set, Number });
  return exports.indexConfirmedVisualDocumentLinks;
}
const index = getHelper();
const legacy = [
  { id: 105, bankTransactionId: 328, documents: [{ documentId: 282, receiptId: 86, sourceMissing: false }] },
  { id: 108, bankTransactionId: 329, documents: [{ documentId: 382, receiptId: null, sourceMissing: true }] },
];

test('historical #105 proves only #282 for bank #328, regardless of amounts or other documents', () => {
  const links = index(legacy, []);
  assert.deepEqual(Array.from(links.get(282), l => [l.reconciliationId, l.bankTransactionId, l.origin]), [[105,328,'existing']]);
  assert.equal(links.has(334), false, 'same amount is never a confirmed link');
  assert.equal(links.has(901), false);
});
test('missing originals keep a canonical confirmed status; VOID sets never count as confirmed', () => {
  const links = index(legacy, [
    { id: 300, bankTransactionId: 330, status: 'CONFIRMED', documentIds: [99,101] },
    { id: 301, bankTransactionId: 331, status: 'VOID', documentIds: [100] },
  ]);
  assert.equal(links.get(382)[0].reconciliationId, 108);
  assert.equal(links.get(99)[0].bankTransactionId, 330);
  assert.equal(links.get(101)[0].origin, 'documentSet');
  assert.equal(links.has(100), false);
});
test('corrupt IDs are ignored and duplicate recorded participants do not double-render', () => {
  const links = index([...legacy, legacy[0], {id: 42, bankTransactionId: 1, documents: [{documentId: 0}, {documentId: -1}]}], [
    {id: 105, bankTransactionId: 328, status: 'CONFIRMED', documentIds: [282]},
  ]);
  assert.equal(links.get(282).length, 1);
  assert.equal(links.has(0), false);
  assert.equal(links.has(-1), false);
});
test('all three panels and archive use one index and guard against double-linking', () => {
  assert.match(ui, /indexConfirmedVisualDocumentLinks\(existingConfirmedReconciliations, documentSets\)/);
  assert.match(ui, /data-testid="linked-sources-confirmed"/);
  assert.match(ui, /data-testid=\{`archive-confirmed-\$\{item\.documentId\}`\}/);
  assert.match(ui, /alreadyLinked\.length === 0 \? <button/);
  assert.match(ui, /!historicalEvidenceUnavailable && comparedAmounts/);
  assert.match(ui, /!confirmedDocumentLinks\.has\(item\.documentId\)/);
  assert.match(ui, /const firstExistingOriginal/);
});
test('four UI languages cover the confirmed source state', () => {
  for (const lang of ['is', 'en', 'pl', 'sr']) {
    const portion = languages.slice(languages.indexOf(`  ${lang}: {`));
    for (const key of ['confirmedSourcesTitle','alreadyLinked','bankTransactionShort','linkedToAnotherBank']) {
      assert.match(portion, new RegExp(`${key}:`));
    }
  }
});
