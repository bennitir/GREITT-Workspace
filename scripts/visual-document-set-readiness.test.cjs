'use strict';
// Read-only contract: synthetic fixtures, zero external connections.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'lib/financial-reconciliation/document-set-service.ts'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'app/banki/[id]/afstemming/VisualReconciliationWorkspace.tsx'), 'utf8');
const action = fs.readFileSync(path.join(root, 'app/banki/[id]/afstemming/document-set-actions.ts'), 'utf8');
const page = fs.readFileSync(path.join(root, 'app/banki/[id]/afstemming/page.tsx'), 'utf8');
const translations = fs.readFileSync(path.join(root, 'app/banki/_lib/i18n/visual-reconciliation-text.ts'), 'utf8');
const translated = ts.transpileModule(source, { fileName: 'document-set-service.ts',
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, reportDiagnostics: true });
assert.equal(translated.diagnostics?.length ?? 0, 0);

class Decimal {
  constructor(n) { this.n = Number(n); }
  add(other) { return new Decimal(this.n + other.n); }
  abs() { return new Decimal(Math.abs(this.n)); }
  isZero() { return this.n === 0; }
  eq(other) { return this.n === other.n; }
}
let bank = { id: 329, status: 'UNRECONCILED', amount: new Decimal(-901) };
let doc = { id: 328, reviewedAt: new Date(), reviewedContentRevision: 1, contentRevision: 1,
  duplicateMarkedAt: null, needsAttentionAt: null, documentRole: 'PRIMARY', documentType: 'INVOICE',
  totalAmount: 901, financialEventLinks: [] };
let hasExistingLink = false;
let hasPayment = false;
let hasDocClaim = false;
const forbiddenMutations = () => { throw Error('Unexpected mutation in SELECT-only readiness'); };
const db = {
  $transaction: async callback => callback(db),
  bankTransaction: { findFirst: async () => bank, create: forbiddenMutations, update: forbiddenMutations, updateMany: forbiddenMutations },
  financialReconciliationParticipant: { findFirst: async args => args.where.sourceType === 'BANK_TRANSACTION'
    ? (hasExistingLink ? { id: 1 } : null) : (hasDocClaim ? { id: 2 } : null) },
  financialEventPayment: { findFirst: async () => hasPayment ? { id: 77 } : null },
  aiDetectedDocument: { findMany: async () => doc ? [doc] : [] },
  $queryRaw: async () => [{ present: false }],
  financialReconciliation: { create: forbiddenMutations, updateMany: forbiddenMutations },
  auditEvent: { create: forbiddenMutations },
};
const exportsObject = {};
const syntheticEnv = {};
vm.runInNewContext(translated.outputText, {
  exports: exportsObject, process: { env: syntheticEnv }, URL,
  require: name => {
    if (name === 'server-only') return {};
    if (name === '@/app/generated/prisma/client') return { Prisma: { Decimal } };
    if (name === '@/lib/prisma') return { prisma: db };
    // These synthetic fixtures are read-only; Production attestation must reject.
    if (name === '@/lib/financial-reconciliation/bank-allocation-contract') return {
      assertVerifiedBankAllocationContract: async () => { throw Error('CLAIM_GUARD_UNVERIFIED'); },
    };
    if (name === '@/lib/core/verified-database-tls') return {
      hasVerifiedCaTlsConfigWithoutUrlMode: () => false,
    };
    if (name === '@/lib/core/verified-document-set-database-tls') return {
      assertVerifiedDocumentSetTls: async () => {
        if (syntheticEnv.VERCEL_ENV === 'production') throw Error('PRODUCTION_DATABASE_TLS_UNVERIFIED');
      },
    };
    throw Error('unexpected dependency ' + name);
  },
}, { filename: 'document-set-service.js' });
const inspect = () => exportsObject.inspectVisualDocumentSet({companyId:8,bankAccountId:2,bankTransactionId:329,documentIds:[328]});
const reset = () => {
  bank = { id: 329, status: 'UNRECONCILED', amount: new Decimal(-901) };
  doc = { id: 328, reviewedAt: new Date(), reviewedContentRevision: 1, contentRevision: 1,
    duplicateMarkedAt: null, needsAttentionAt: null, documentRole: 'PRIMARY', documentType: 'INVOICE',
    totalAmount: 901, financialEventLinks: [] };
  hasExistingLink = false; hasPayment = false; hasDocClaim = false;
};
test('valid synthetic #329/#328 is eligible but readiness performs no writes', async () => {
  reset(); assert.equal(await inspect(), 'READY');
});
test('already reconciled bank movement fails closed', async () => {
  reset(); bank.status = 'RECONCILED'; assert.equal(await inspect(), 'BANK_ALREADY_RECONCILED');
});
test('already confirmed source or bank blocks duplicate association', async () => {
  reset(); hasDocClaim = true; assert.equal(await inspect(), 'DOCUMENT_ALREADY_LINKED');
  reset(); hasExistingLink = true; assert.equal(await inspect(), 'EXISTING_LINK');
});
test('unreviewed/stale or FinancialEvent PRIMARY documents are not eligible', async () => {
  reset(); doc.reviewedContentRevision = 0; assert.equal(await inspect(), 'DOCUMENT_NEEDS_REVIEW');
  reset(); doc.financialEventLinks = [{ id: 3 }]; assert.equal(await inspect(), 'DOCUMENT_NEEDS_REVIEW');
});
test('amount mismatch and existing payment cannot be approved', async () => {
  reset(); doc.totalAmount = 900; assert.equal(await inspect(), 'AMOUNT_MISMATCH');
  reset(); hasPayment = true; assert.equal(await inspect(), 'PAYMENT_LINK');
});
test('server authorization checks persist while UI exposes one-click confirmation', () => {
  assert.match(action, /authorizeVisualConfirmation\(\)/);
  // Read-only preflight is available; it never authorizes a write.
  assert.match(action, /export async function inspectSelectedVisualDocuments/);
  assert.match(action, /const \{ companyId \} = await authorizeVisualConfirmation\(\)/);
  assert.match(source, /export async function inspectVisualDocumentSet/);
  assert.match(page, /documentSetInspectAction=\{inspectSelectedVisualDocuments\}/);
  assert.match(ui, /onClick=\{inspectGroup\}/);
  assert.match(ui, /onClick=\{confirmGroup\}/);
  assert.match(ui, /disabled=\{!canSubmitGroup \|\| !documentSetCanConfirm \|\| groupPending\}/);
  assert.match(ui, /if \(!selected \|\| !canSubmitGroup \|\| !documentSetCanConfirm \|\| !documentSetConfirmAction\) return;/);
  assert.match(source, /if \(!documentSetStorageEnabled\(process.env, \{ companyId: input.companyId, bankAccountId: input.bankAccountId \}\)\) throw new Error/);
});
test('all four language variants explain readiness and lack of write access', () => {
  for (const lang of ['is', 'en', 'pl', 'sr']) {
    const section = translations.slice(translations.indexOf(`  ${lang}: {`));
    for (const key of ['groupInspectNeedsReview', 'groupInspectAmountMismatch', 'groupStorageDisabled', 'groupConfirmButton']) {
      assert.match(section, new RegExp(`${key}:`));
    }
  }
});
