// Visual-only regression: the first ranked document may be previewed, never matched or posted.
// Does not contact Supabase, Vercel, AI or any external system.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const uiFile = path.join(root, 'app/banki/[id]/afstemming/VisualReconciliationWorkspace.tsx');
const i18nFile = path.join(root, 'app/banki/_lib/i18n/visual-reconciliation-text.ts');
const ui = fs.readFileSync(uiFile, 'utf8');
const i18n = fs.readFileSync(i18nFile, 'utf8');

test('preview UI and four-language text parse as TypeScript/TSX', () => {
  for (const [fileName, source] of [[uiFile,ui],[i18nFile,i18n]]) {
    const out = ts.transpileModule(source,{fileName,reportDiagnostics:true,compilerOptions:{
      target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,
    }});
    assert.deepEqual(out.diagnostics ?? [], []);
  }
});

test('automatic preview uses only an authorized ranked suggestion for an unfinished bank movement', () => {
  assert.match(ui, /const topSuggestion = selected\?\.bankStatus === 'UNRECONCILED' && !suggestionAlreadyConfirmed/);
  assert.match(ui, /suggestedRanked\.find\(\(\{ item \}\) => Number\.isSafeInteger\(item\.receiptId\) && item\.receiptId > 0\)/);
  assert.match(ui, /selected\?\.id === suggestedDocuments\?\.bankId/);
  assert.match(ui, /model\.bankAccountId === suggestedDocuments\?\.bankAccountId/);
  assert.match(ui, /if \(!documentPreviewEnabled \|\| !selected \|\| topSuggestionReceiptId === null/);
});

test('preview opens only a document, with no automatic comparison or confirmation', () => {
  const from = ui.indexOf('  // The first ranked authorized document is opened for visual review only.');
  const to = ui.indexOf('  const panel =', from);
  assert.ok(from > 0 && to > from);
  const auto = ui.slice(from, to);
  assert.match(auto, /setPreview\(\{ receiptId: topSuggestionReceiptId, documentId: topSuggestionDocumentId \}\)/);
  assert.doesNotMatch(auto, /setComparisonByBank\(/);
  assert.doesNotMatch(auto, /documentSetConfirmAction\(/);
  assert.doesNotMatch(auto, /startGroupAction\(/);
});

test('explicit document opening takes priority over a delayed suggestion', () => {
  assert.match(ui, /preview !== null \|\| sourceKey !== null/);
  assert.match(ui, /function openDocument\(receiptId: number, documentId: number \| null\)/);
  assert.match(ui, /setSuggestedPreview\(null\);\s*setPreview\(\{ receiptId, documentId \}\);/);
});

test('closing the automatic preview never reopens it for the same bank movement', () => {
  assert.match(ui, /const closedSuggestionPreviews = useRef\(new Set<number>\(\)\)/);
  assert.match(ui, /closedSuggestionPreviews\.current\.has\(selected\.id\)/);
  assert.match(ui, /function closePreview\(\) \{\s*if \(selected\) closedSuggestionPreviews\.current\.add\(selected\.id\)/);
  assert.match(ui, /onClick=\{closePreview\}/);
});

test('right pane explicitly labels suggestion as unconfirmed, in four languages', () => {
  assert.match(ui, /data-testid="preview-unconfirmed-suggestion"/);
  assert.match(ui, /\{previewIsSuggestion && <p role="status"/);
  assert.match(ui, /\{t\.suggestPreviewOnly\}/);
  const strings = i18n.match(/suggestPreviewOnly: '[^']+'/g) || [];
  assert.equal(strings.length, 4);
  assert.match(strings[0], /staðfest/);
  assert.match(strings[1], /confirmed/);
  assert.match(strings[2], /potwierdzonego/);
  assert.match(strings[3], /potvrđenu/);
});

test('bank change clears suggestion badge, with independent column scrolling unchanged', () => {
  assert.match(ui, /setSelectedId\(row\.id\); setSourceKey\(null\); setPreview\(null\); setSuggestedPreview\(null\)/);
  assert.match(ui, /ref=\{middleScroll\}/);
  assert.match(ui, /ref=\{rightScroll\}/);
  assert.match(ui, /data-testid="visual-suggestions-scroll"/);
  assert.match(ui, /data-testid="visual-draft-comparison"/);
});
