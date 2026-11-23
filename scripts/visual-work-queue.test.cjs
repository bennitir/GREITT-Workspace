// Focused regression coverage for the visual bank work queue. No DB or network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const uiFile = path.join(root, 'app/banki/[id]/afstemming/VisualReconciliationWorkspace.tsx');
const queueFile = path.join(root, 'app/banki/_lib/visual-work-queue.ts');
const stringsFile = path.join(root, 'app/banki/_lib/i18n/visual-reconciliation-text.ts');
const compile = (file, jsx = false) => {
  const src = fs.readFileSync(file, 'utf8');
  const result = ts.transpileModule(src, {
    reportDiagnostics: true,
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS,
      jsx: jsx ? ts.JsxEmit.ReactJSX : ts.JsxEmit.Preserve },
  });
  assert.deepEqual((result.diagnostics || []).filter(x => x.category === ts.DiagnosticCategory.Error)
    .map(x => ts.flattenDiagnosticMessageText(x.messageText, '\n')), []);
  return { source: src, output: result.outputText };
};
const queue = compile(queueFile);
const moduleBox = { exports: {} };
vm.runInNewContext(queue.output, { module: moduleBox, exports: moduleBox.exports });
const { splitVisualWorkQueue } = moduleBox.exports;
const ids = rows => Array.from(rows, row => row.id);

test('unfinished bank movements appear first, preserving their original order', () => {
  const rows = [
    { id: 328, bankStatus: 'RECONCILED' },
    { id: 329, bankStatus: 'UNRECONCILED' },
    { id: 330, bankStatus: 'UNRECONCILED' },
    { id: 331, bankStatus: 'RECONCILED' },
  ];
  const result = splitVisualWorkQueue(rows, new Set());
  assert.deepEqual(ids(result.pending), [329, 330]);
  assert.deepEqual(ids(result.completed), [328, 331]);
  assert.deepEqual(ids(rows), [328, 329, 330, 331]);
});

test('confirmed document links prevent mislabeling an unfinished bank movement', () => {
  const rows = [{ id: 1, bankStatus: 'UNRECONCILED' }, { id: 2, bankStatus: 'UNRECONCILED', evidence: [{ status: 'confirmed' }] }];
  const result = splitVisualWorkQueue(rows, new Set([1]));
  assert.deepEqual(ids(result.pending), []);
  assert.deepEqual(ids(result.completed), [1, 2]);
});

test('unverified status remains visible and is not falsely treated as complete', () => {
  const rows = [{ id: 3, bankStatus: null }, { id: 4, bankStatus: 'UNKNOWN' }];
  const result = splitVisualWorkQueue(rows, new Set());
  assert.deepEqual(ids(result.pending), [3, 4]);
  assert.deepEqual(ids(result.completed), []);
});

test('empty input and completed-only views remain predictable', () => {
  assert.deepEqual(ids(splitVisualWorkQueue([], new Set()).pending), []);
  const result = splitVisualWorkQueue([{ id: 9, bankStatus: 'RECONCILED' }], new Set());
  assert.deepEqual(ids(result.pending), []);
  assert.deepEqual(ids(result.completed), [9]);
});

test('comparison no longer calls the removed groupReviewed setter', () => {
  const { source } = compile(uiFile, true);
  assert.doesNotMatch(source, /setGroupReviewed\s*\(/);
  assert.match(source, /setComparisonByBank\s*\(/);
  assert.match(source, /splitVisualWorkQueue\(rows, confirmedBankIds\)/);
  assert.match(source, /showCompleted/);
  assert.match(source, /query\.trim\(\)\.length > 0/);
  assert.match(source, /aria-expanded=\{showCompleted\}/);
});

test('queue strings are present in all four UI languages', () => {
  const { source } = compile(stringsFile);
  for (const key of ['pendingTransactions', 'noPendingTransactions', 'showCompleted', 'hideCompleted', 'completedTransactions']) {
    assert.equal((source.match(new RegExp(`\\b${key}:`, 'g')) || []).length, 4, key);
  }
});
