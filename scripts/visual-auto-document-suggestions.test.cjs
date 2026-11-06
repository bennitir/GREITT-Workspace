// UX-only regression checks: automatic READ search on bank selection, no write or auto-selection.
// Deliberately no database, network or AI service access.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const uiPath = path.join(root, 'app/banki/[id]/afstemming/VisualReconciliationWorkspace.tsx');
const i18nPath = path.join(root, 'app/banki/_lib/i18n/visual-reconciliation-text.ts');
const ui = fs.readFileSync(uiPath, 'utf8');
const translations = fs.readFileSync(i18nPath, 'utf8');

test('visual workspace and all language strings parse as TS/TSX', () => {
  for (const [file, source] of [[uiPath, ui], [i18nPath, translations]]) {
    const output = ts.transpileModule(source, { fileName: file, reportDiagnostics: true, compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    }});
    assert.equal(output.diagnostics?.length ?? 0, 0, file);
  }
});

test('bank selection triggers the authorized document search without a second click', () => {
  assert.match(ui, /const suggestionBankId = selected\?\.id \?\? null/);
  assert.match(ui, /useEffect\(\(\) => \{\s*if \(suggestionBankId === null/);
  assert.match(ui, /setTimeout\(\(\) => \{/);
  assert.match(ui, /documentSearchAction\(model\.bankAccountId, anchor\)/);
  assert.match(ui, /\}, \[suggestionBankId, suggestionBankText, suggestionAlreadyConfirmed, model\.bankAccountId,/);
  assert.match(ui, /setSelectedId\(row\.id\)/);
});

test('auto search neither selects documents nor creates any reconciliation', () => {
  const autoStart = ui.indexOf('// The selected bank movement itself starts the shortlist lookup.');
  const autoEnd = ui.indexOf('  function searchArchive()', autoStart);
  const auto = ui.slice(autoStart, autoEnd);
  assert.ok(autoStart > 0 && autoEnd > autoStart);
  assert.doesNotMatch(auto, /setComparisonByBank\(/);
  assert.doesNotMatch(auto, /documentSetConfirmAction\(/);
  assert.doesNotMatch(auto, /router\.refresh\(/);
  assert.match(ui, /onClick=\{\(\) => toggleComparison\(item\)\}/);
  assert.match(ui, /disabled=\{!canSubmitGroup \|\| !documentSetCanConfirm \|\| groupPending\}/);
});

test('stale searches cannot replace the currently selected bank shortlist', () => {
  assert.match(ui, /let cancelled = false/);
  assert.match(ui, /return \(\) => \{ cancelled = true; clearTimeout\(timer\); \}/);
  assert.match(ui, /if \(cancelled\) return;\s*suggestionCache\.current\.set\(cacheKey, outcome\)/);
  assert.match(ui, /selected\?\.id === suggestedDocuments\?\.bankId/);
  assert.match(ui, /model\.bankAccountId === suggestedDocuments\?\.bankAccountId/);
});

test('reads are debounced, bounded, cached per bank account and manually refreshable', () => {
  assert.match(ui, /\}, 220\);/);
  assert.match(ui, /const cacheKey = `\$\{accountId\}:\$\{suggestionBankId\}:\$\{anchor\}`/);
  assert.match(ui, /suggestionCache\.current\.size > 20/);
  assert.match(ui, /suggestionCache\.current\.delete\(`\$\{model\.bankAccountId\}:\$\{selected\.id\}:\$\{anchor\}`\)/);
  assert.match(ui, /setSuggestionRefresh\(value => value \+ 1\)/);
});

test('read search is skipped for already confirmed bank movements', () => {
  assert.match(ui, /const suggestionAlreadyConfirmed = Boolean\(selected && \(selected\.bankStatus === 'RECONCILED'/);
  assert.match(ui, /if \(suggestionBankId === null \|\| suggestionAlreadyConfirmed \|\|/);
});

test('Icelandic, English, Polish and Serbian hint text reflects automatic search', () => {
  const hints = translations.match(/suggestClickHint: '[^']+'/g) || [];
  assert.equal(hints.length, 4);
  assert.ok(hints.every(h => !h.includes('Smelltu á heitið til að finna') && !h.includes('Click the transaction description to find')));
});
