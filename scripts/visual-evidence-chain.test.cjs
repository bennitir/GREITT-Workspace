'use strict';
// Synthetic fixtures only: no database, environment, network or server startup.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, imports = {}) {
  const exports = {};
  const result = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics.length, 0);
  new vm.Script(result.outputText).runInNewContext({ exports, require: name => {
    if (imports[name]) return imports[name];
    throw Error('Unexpected runtime import: ' + name);
  } });
  return exports;
}
const projection = load('app/banki/_lib/visual-evidence-chain.ts');
const bank = () => ({ id: 329, date: '2026-01-02', text: 'Synthetic', amount: '-901', evidence: [
  { key: 'booking:553', kind: 'booking', status: 'recorded', sourceId: 553, receiptId: 900,
    title: 'Existing', amount: '-901', currency: 'ISK', date: null, reference: null, confirmationId: null },
] });
test('distinct ID namespaces and matching amounts do not invent bank/document/booking links', () => {
  const input = bank(), before = JSON.stringify(input);
  const result = projection.buildEvidenceChain(input, [{ receiptId: 800, documentId: 328 }], { receiptId: 801, documentId: 85 });
  for (const node of ['BankTransaction #329', 'AiDetectedDocument #328', 'AiDetectedDocument #85', 'ReceiptEntry #553']) assert.ok(result.nodes.includes(node));
  assert.equal(result.relations.filter(r => r.kind === 'confirmed').length, 0);
  assert.ok(!result.relations.some(r => r.from === 'ReceiptEntry #553' && r.to.startsWith('AiDetectedDocument')));
  assert.equal(result.relations.find(r => r.kind === 'preview').to, 'AiDetectedDocument #85');
  assert.equal(JSON.stringify(input), before);
});
test('shared receipt proves source relationship, never a document-specific posting or bank confirmation', () => {
  const result = projection.buildEvidenceChain(bank(), [{ receiptId: 900, documentId: 85 }], null);
  assert.equal(result.relations.filter(r => r.to === 'Receipt #900' && r.kind === 'source').length, 2);
  assert.equal(result.relations.filter(r => r.kind === 'confirmed').length, 0);
});
test('repeated booking evidence is counted once, numeric collisions remain separate', () => {
  const input = bank();
  input.evidence.push({ key: 'event:329', kind: 'event', status: 'candidate', sourceId: 329, receiptId: null,
    sourceDocuments: [{ receiptId: 900, documentId: 329, bookingEntryIds: [553, 553] }] });
  const result = projection.buildEvidenceChain(input, [{ receiptId: 329, documentId: 329 }], null);
  assert.equal(result.nodes.filter(n => n === 'ReceiptEntry #553').length, 1);
  assert.equal(result.nodes.filter(n => n === 'AiDetectedDocumentEntry #553').length, 1);
  assert.equal(result.relations.filter(r => r.from === 'AiDetectedDocumentEntry #553' && r.to === 'AiDetectedDocument #329').length, 1);
  assert.equal(result.relations.filter(r => r.from === 'ReceiptEntry #553' && r.to === 'Receipt #900').length, 1);
  for (const kind of ['BankTransaction', 'Receipt', 'AiDetectedDocument', 'FinancialEvent']) assert.ok(result.nodes.includes(`${kind} #329`));
});
test('only explicit confirmations qualify; duplicate confirmation inputs collapse', () => {
  const confirmation = { id: 77, documents: [{ receiptId: null, documentId: 85 }] };
  const result = projection.buildEvidenceChain(bank(), [], null, [confirmation, confirmation]);
  assert.equal(result.relations.filter(r => r.kind === 'confirmed').length, 1);
  assert.equal(result.relations.find(r => r.kind === 'confirmed').confirmationId, 77);
  const input = bank(); input.evidence[0].status = 'confirmed';
  assert.equal(projection.buildEvidenceChain(input, [], null).relations.filter(r => r.kind === 'confirmed').length, 0);
});
test('read-only rendered panel distinguishes statuses and incomplete evidence without forms', () => {
  const React = require('react');
  const component = load('app/banki/[id]/afstemming/ReconciliationEvidenceChain.tsx', {
    '../../_lib/visual-evidence-chain': projection, 'react/jsx-runtime': require('react/jsx-runtime'),
  }).default;
  const html = require('react-dom/server').renderToStaticMarkup(React.createElement(component, {
    bank: bank(), selected: [], preview: { receiptId: 801, documentId: 85 }, confirmations: [], incomplete: true,
  }));
  assert.match(html, /Fyrirliggjandi bókun/); assert.match(html, /Forskoðun/); assert.match(html, /Gögn vantar/);
  assert.doesNotMatch(html, /<form|<button|Staðfest afstemming/);
});
