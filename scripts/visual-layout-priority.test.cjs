// Deterministic interface-order checks; no databases, fetches or writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const sourcePath = path.resolve(__dirname, '../app/banki/[id]/afstemming/VisualReconciliationWorkspace.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');

test('center column TSX parses without syntax diagnostics', () => {
  const output = ts.transpileModule(source, { fileName: sourcePath, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  assert.equal(output.diagnostics?.length ?? 0, 0);
});
test('selected documents, totals and reconcile action are ABOVE suggestions', () => {
  const centerIndex = source.indexOf('aria-label={t.bank}');
  const comparisonIndex = source.indexOf('data-testid="visual-draft-comparison"');
  const totalIndex = source.indexOf('t.archiveCompareTotal', comparisonIndex);
  const confirmIndex = source.indexOf('t.groupConfirmButton', comparisonIndex);
  const suggestionsIndex = source.indexOf('data-testid="visual-suggested-documents"');
  const rightIndex = source.indexOf('aria-label={t.sources}', suggestionsIndex);
  assert.ok(centerIndex > 0 && comparisonIndex > centerIndex);
  assert.ok(totalIndex > comparisonIndex && confirmIndex > totalIndex);
  assert.ok(suggestionsIndex > confirmIndex && rightIndex > suggestionsIndex);
  assert.equal(source.match(/data-testid="visual-draft-comparison"/g)?.length, 1);
  assert.equal(source.match(/data-testid="visual-suggested-documents"/g)?.length, 1);
});
test('suggestions scroll inside the center column without moving the reconciliation action', () => {
  assert.match(source, /data-testid="visual-suggestions-scroll"/);
  assert.match(source, /max-h-\[30vh\] overflow-y-auto overscroll-contain/);
  assert.match(source, /data-testid="visual-selected-documents-scroll"/);
  assert.match(source, /max-h-\[22vh\] space-y-2 overflow-y-auto overscroll-contain/);
  assert.match(source, /ref=\{middleScroll\}/);
});
test('suggestions remain manual and confirmation still has the original permission guards', () => {
  assert.match(source, /onClick=\{\(\) => toggleComparison\(item\)\}/);
  assert.match(source, /onClick=\{confirmGroup\}/);
  assert.match(source, /disabled=\{!canSubmitGroup \|\| !documentSetCanConfirm \|\| groupPending\}/);
  assert.match(source, /if \(!selected \|\| !canSubmitGroup \|\| !documentSetCanConfirm \|\| !documentSetConfirmAction\) return;/);
  assert.doesNotMatch(source, /setGroupReviewed\(/);
});
