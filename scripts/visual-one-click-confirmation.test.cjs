'use strict';
// Targeted contract checks using synthetic values. No .env and no database/network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const ui = read('app/banki/[id]/afstemming/VisualReconciliationWorkspace.tsx');
const page = read('app/banki/[id]/afstemming/page.tsx');
const action = read('app/banki/[id]/afstemming/document-set-actions.ts');
const i18n = read('app/banki/_lib/i18n/visual-reconciliation-text.ts');
const service = read('lib/financial-reconciliation/document-set-service.ts');

for (const [name, body, kind] of [
  ['visual',ui,ts.ScriptKind.TSX], ['page',page,ts.ScriptKind.TSX],
  ['actions',action,ts.ScriptKind.TS], ['translations',i18n,ts.ScriptKind.TS],
]) {
  test(`${name} source parses without TypeScript diagnostics`, () => {
    const result = ts.transpileModule(body, { fileName: name + (kind === ts.ScriptKind.TSX ? '.tsx' : '.ts'),
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
      reportDiagnostics: true });
    assert.equal(result.diagnostics?.length ?? 0, 0);
  });
}

test('ordinary flow is ONE reconcile button; no preflight or consent checkbox', () => {
  assert.match(ui, /onClick=\{confirmGroup\}/);
  assert.match(ui, /groupPending \? t\.groupSaving : t\.groupConfirmButton/);
  assert.doesNotMatch(ui, /documentSetInspectAction|inspectGroup\(|groupReviewed\[|groupReviewedStatement/);
  assert.doesNotMatch(ui, /data-testid="document-set-readiness"/);
  assert.doesNotMatch(page, /documentSetInspectAction=/);
  assert.match(ui, /!canSubmitGroup \|\| !documentSetCanConfirm \|\| groupPending/);
  assert.match(ui, /if \(!result\.ok\)/);
  assert.match(ui, /router\.refresh\(\)/);
  assert.match(service, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(service, /auditEvent\.create/);
  assert.match(service, /where: \{ id: bank\.id, status: 'UNRECONCILED' \}/);
});

test('one click translated consistently across 4 UI languages', () => {
  for (const label of ["groupConfirmButton: 'Afstemma'", "groupConfirmButton: 'Reconcile'",
    "groupConfirmButton: 'Uzgodnij'", "groupConfirmButton: 'Усагласи'"]) {
    assert.ok(i18n.includes(label), label);
  }
});

let enabled = false;
let shouldThrow = null;
let calls = 0;
let refreshes = 0;
let authorized = true;
const exportsObject = {};
const transpile = ts.transpileModule(action, { fileName: 'document-set-actions.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(transpile, {
  exports: exportsObject, Error, process: { env: {} },
  require(name) {
    if (name === 'next/cache') return { revalidatePath() { refreshes++; } };
    if (name === '@/lib/core/company-read-access') return {
      requireActiveCompanyReadAccess: async () => ({ companyId: 8, access: { canReconcileBookkeeping: authorized } })
    };
    if (name === '@/lib/core/request-context') return { getRequestAuthContext: async () => ({
      sessionUser: { id: 13 }, effectiveUser: { id: 13 }
    }) };
    if (name === '@/lib/financial-reconciliation/document-set-service') return {
      documentSetStorageEnabled: (_, scope) => scope.companyId === 8 && scope.bankAccountId === 2 && enabled,
      canonicalDocumentIds: ids => ids,
      confirmVisualDocumentSet: async input => {
        calls++;
        assert.equal(input.companyId, 8);
        assert.equal(input.bankAccountId, 2);
        assert.equal(input.bankTransactionId, 329);
        assert.equal(input.userId, 13);
        if (shouldThrow) throw new Error(shouldThrow);
        return { id: 118, idempotent: false };
      },
      inspectVisualDocumentSet: async () => 'READY',
      voidVisualDocumentSet: async () => ({id: 118}),
    };
    throw new Error('unexpected require ' + name);
  },
}, {filename: 'document-set-actions.js'});
const confirm = () => exportsObject.confirmSelectedVisualDocuments(2, 329, [328]);

test('write disabled by default even if client submits action directly', async () => {
  enabled=false; authorized=true; calls=0; refreshes=0;
  const result = await confirm();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'STORAGE_DISABLED');
  assert.equal(calls, 0); assert.equal(refreshes, 0);
});

test('no permission blocks before touching service', async () => {
  authorized=false; enabled=true; calls=0;
  await assert.rejects(confirm(), /SAMSTAEDA_EKKI_HEIMILD/);
  assert.equal(calls,0); authorized=true;
});

test('successful confirmation does one write operation and refreshes UI', async () => {
  enabled=true; shouldThrow=null; calls=0; refreshes=0;
  const result=await confirm();
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {ok:true,id:118,idempotent:false});
  assert.equal(calls,1); assert.equal(refreshes,3);
});

test('failed review or already-linked state returns safe actionable feedback without refreshing', async () => {
  for (const [err,code] of [
    ['SAMSTAEDA_SKJAL_THARF_YFIRFERD','DOCUMENT_NEEDS_REVIEW'],
    ['SAMSTAEDA_SKJAL_THEGAR_TENGT','DOCUMENT_ALREADY_LINKED'],
    ['SAMSTAEDA_BANKI_THEGAR_AFGREIDDUR','BANK_ALREADY_RECONCILED'],
    ['SAMSTAEDA_FJARHAEDIR_STEMMA_EKKI','AMOUNT_MISMATCH'],
    ['SAMSTAEDA_BANKI_THEGAR_GREIDSLA','PAYMENT_LINK'],
  ]) {
    shouldThrow=err; refreshes=0;
    const result=await confirm();
    assert.equal(result.ok,false); assert.equal(result.reason,code);
    assert.equal(refreshes,0);
  }
  shouldThrow=null;
});

test('unexpected backend error never leaks its internals to browser result', async () => {
  enabled=true; shouldThrow='jdbc: secretpassword at internal-db:9876';
  const result=await confirm();
  assert.equal(result.ok,false); assert.equal(result.reason,'UNAVAILABLE');
  shouldThrow=null;
});
