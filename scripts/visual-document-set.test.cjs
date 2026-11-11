// Database-free, focused checks. No .env, network or live connection required.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../lib/financial-reconciliation/document-set-service.ts'), 'utf8');
const transpiled = ts.transpileModule(source, {
  fileName: 'document-set-service.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(transpiled.diagnostics?.length ?? 0, 0, 'Source TypeScript must be syntactically valid');
// Transpile the real TLS helper for this database-free VM test.
// Never replace it with a constant true stub: the policy must be exercised.
const tlsSource = fs.readFileSync(path.join(__dirname, '../lib/core/verified-database-tls.ts'), 'utf8');
const tlsTranspiled = ts.transpileModule(tlsSource, {
  fileName: 'verified-database-tls.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const tlsExports = {};
new Function('exports', 'require', tlsTranspiled.outputText)(tlsExports, require);
const exportsObj = {};
const db = {
  bankAccount: { findFirst: async () => ({ id: 2 }) },
  bankTransaction: { findMany: async () => [{ id: 328 }] },
  financialReconciliation: { findMany: async () => [] },
  aiDetectedDocument: { findMany: async () => [] },
  auditEvent: { findMany: async () => [] },
};
const sandbox = {
  exports: exportsObj,
  process: { env: {} },
  URL,
  require(name) {
    if (name === 'server-only') return {};
    if (name === '@/app/generated/prisma/client') return { Prisma: {} };
    if (name === '@/lib/prisma') return { prisma: db };
    if (name === '@/lib/core/verified-database-tls') return tlsExports;
    throw Error(`Unexpected module: ${name}`);
  },
};
vm.runInNewContext(transpiled.outputText, sandbox, { filename: 'document-set-service.js' });
function errorCode(fn) { try { fn(); return null; } catch (error) { return error.message; } }
const TEST = 'rfvuzcchsaamrykpdiqm';
const PROD = 'wjobcdjhqjirgyfbeuze';
function enabled(dbUrl, overrides = {}) {
  return exportsObj.documentSetStorageEnabled({
    GLOGGT_DOCUMENT_SET_CONFIRM_ENABLED: 'true',
    DATABASE_URL: dbUrl,
    ...overrides,
  });
}

test('document identities are unique, positive and canonical', () => {
  assert.equal(JSON.stringify(exportsObj.canonicalDocumentIds([8, 3, 4])), '[3,4,8]');
  assert.equal(errorCode(() => exportsObj.canonicalDocumentIds([4, 4])), 'SAMSTAEDA_TVITEKIN_SKJOL');
  assert.equal(errorCode(() => exportsObj.canonicalDocumentIds([1, 0])), 'SAMSTAEDA_OGILT_AUDKENNI');
  assert.equal(errorCode(() => exportsObj.canonicalDocumentIds([])), 'SAMSTAEDA_FJOLDI_SKJALA');
  assert.equal(errorCode(() => exportsObj.canonicalDocumentIds(Array.from({ length: 51 }, (_, i) => i + 1))), 'SAMSTAEDA_FJOLDI_SKJALA');
});

test('test project requires exact host, dedicated runtime role, PostgreSQL DB and TLS', () => {
  const good = `postgresql://gloggt_preview_runtime:example@db.${TEST}.supabase.co:5432/postgres?sslmode=require`;
  const pooler = `postgresql://gloggt_preview_runtime.${TEST}:example@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require`;
  assert.equal(exportsObj.documentSetStorageEnabled({ DATABASE_URL: good }), false, 'No opt-in');
  assert.equal(enabled(good), true);
  assert.equal(enabled(pooler), true);
  assert.equal(enabled(good.replace('sslmode=require', 'sslmode=disable')), false);
  assert.equal(enabled(good.replace('gloggt_preview_runtime', 'postgres')), false);
  assert.equal(enabled(good.replace('/postgres?', '/different?')), false);
  assert.equal(enabled(good.replace(`db.${TEST}`, `db.${PROD}`)), false);
  assert.equal(enabled(good.replace('db.', 'evil.db.')), false);
  assert.equal(enabled(good.replace('/postgres?', '/postgres?host=db.evil.example&')), false);
  assert.equal(enabled(good.replace('db.', 'db.') + `&note=${TEST}`), true, 'Unknown note should not defeat an exact host check');
  assert.equal(enabled(`postgresql://user:${TEST}@db.${PROD}.supabase.co:5432/postgres?sslmode=require`), false,
    'A Preview ref hidden in the password must not enable Production writes');
  assert.equal(enabled(good, { VERCEL_ENV: 'production' }), false);
  assert.equal(enabled(good, { NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` }), false);
});

test('Production confirmation is scoped to the approved company and account, never enabled by a normal toggle', () => {
  const production = `postgresql://postgres.${PROD}:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require`;
  const good = {
    DATABASE_URL: production,
    NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
    VERCEL_ENV: 'production',
    VERCEL: '1',
    GLOGGT_DOCUMENT_SET_CONFIRM_ENABLED: 'true',
    GLOGGT_DOCUMENT_SET_PRODUCTION_ENABLE: 'approved-manual-document-sets-v1',
    GLOGGT_DOCUMENT_SET_PRODUCTION_SCOPE: '8:2',
  };
  const scope = { companyId: 8, bankAccountId: 2 };
  const allowed = overrides => exportsObj.documentSetStorageEnabled({ ...good, ...overrides }, scope);
  assert.equal(allowed({}), true);
  assert.equal(exportsObj.documentSetStorageEnabled(good), false, 'missing server-side scope');
  assert.equal(exportsObj.documentSetStorageEnabled(good, { companyId: 8, bankAccountId: 3 }), false);
  assert.equal(exportsObj.documentSetStorageEnabled(good, { companyId: 7, bankAccountId: 2 }), false);
  assert.equal(allowed({ VERCEL: undefined }), false);
  assert.equal(allowed({ GLOGGT_DOCUMENT_SET_PRODUCTION_ENABLE: undefined }), false);
  assert.equal(allowed({ GLOGGT_DOCUMENT_SET_CONFIRM_ENABLED: undefined }), false);
  assert.equal(allowed({ VERCEL_ENV: 'preview' }), false);
  assert.equal(allowed({ NEXT_PUBLIC_SUPABASE_URL: `https://${TEST}.supabase.co` }), false);
  assert.equal(allowed({ DATABASE_URL: production.replace('postgres.' + PROD, 'postgres.' + TEST) }), false);
  assert.equal(allowed({ DATABASE_URL: production.replace('postgres.' + PROD, 'gloggt_preview_runtime.' + PROD) }), false);
  assert.equal(allowed({ DATABASE_URL: production.replace('sslmode=require', 'sslmode=disable') }), false);
  assert.equal(allowed({ DIRECT_URL: `postgresql://postgres.${TEST}:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require` }), false);
  assert.equal(allowed({ DIRECT_URL: production }), true);
});

test('Production permits valid Supabase pooler index and region, but never another tenant, host or unsafe TLS', () => {
  const ref = PROD;
  const good = {
    DATABASE_URL: `postgresql://postgres.${ref}:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require`,
    DIRECT_URL: `postgresql://postgres:${'secret'}@db.${ref}.supabase.co:5432/postgres?sslmode=verify-full`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
    VERCEL_ENV: 'production', VERCEL: '1',
    GLOGGT_DOCUMENT_SET_CONFIRM_ENABLED: 'true',
    GLOGGT_DOCUMENT_SET_PRODUCTION_ENABLE: 'approved-manual-document-sets-v1',
    GLOGGT_DOCUMENT_SET_PRODUCTION_SCOPE: '8:2',
  };
  const scope = { companyId: 8, bankAccountId: 2 };
  const state = (overrides = {}) => exportsObj.documentSetStorageState({ ...good, ...overrides }, scope);
  const makeUrl = (host, user = `postgres.${ref}`, mode = 'require', port = '6543') =>
    `postgresql://${user}:secret@${host}:${port}/postgres?sslmode=${mode}`;
  assert.equal(state(), 'READY');
  assert.equal(state({ DATABASE_URL: makeUrl('aws-1-eu-central-1.pooler.supabase.com') }), 'READY');
  assert.equal(state({ DATABASE_URL: makeUrl('aws-12-us-east-2.pooler.supabase.com') }), 'READY');
  assert.equal(state({ DATABASE_URL: makeUrl('aws-0-ap-southeast-1.pooler.supabase.com') }), 'READY');
  assert.equal(state({ DATABASE_URL: makeUrl('aws-1-eu-central-1.pooler.supabase.com', `postgres.${TEST}`) }), 'PRODUCTION_DATABASE_ROLE_NOT_APPROVED');
  assert.equal(state({ DATABASE_URL: makeUrl('aws-1-eu-central-1.pooler.supabase.com.bad.example') }), 'PRODUCTION_DATABASE_HOST_OR_PORT_NOT_APPROVED');
  assert.equal(state({ DATABASE_URL: makeUrl('evil-1-eu-central-1.pooler.supabase.com') }), 'PRODUCTION_DATABASE_HOST_OR_PORT_NOT_APPROVED');
  assert.equal(state({ DATABASE_URL: makeUrl('aws-1-eu-central-1.pooler.supabase.com', `postgres.${ref}`, 'disable') }), 'PRODUCTION_DATABASE_TLS_REQUIRED');
  assert.equal(state({ DATABASE_URL: makeUrl('aws-1-eu-central-1.pooler.supabase.com', `postgres.${ref}`, 'prefer') }), 'PRODUCTION_DATABASE_TLS_REQUIRED');
  assert.equal(state({ DATABASE_URL: makeUrl('aws-1-eu-central-1.pooler.supabase.com', `postgres.${ref}`, 'require', '5555') }), 'PRODUCTION_DATABASE_HOST_OR_PORT_NOT_APPROVED');
  assert.equal(state({ DATABASE_URL: makeUrl('aws-1-eu-central-1.pooler.supabase.com').replace('/postgres?', '/other?') }), 'PRODUCTION_DATABASE_NAME_NOT_APPROVED');
  assert.equal(state({ DATABASE_URL: makeUrl('aws-1-eu-central-1.pooler.supabase.com').replace('?sslmode=require', '') }), 'PRODUCTION_DATABASE_TLS_REQUIRED');
  assert.equal(state({ DATABASE_URL: makeUrl('aws-1-eu-central-1.pooler.supabase.com'), GLOGGT_DOCUMENT_SET_PRODUCTION_SCOPE: '7:2' }), 'PRODUCTION_SCOPE_MISMATCH');
  assert.equal(state({ DIRECT_URL: makeUrl('aws-1-eu-central-1.pooler.supabase.com', `postgres.${TEST}`) }), 'PRODUCTION_DIRECT_CONNECTION_NOT_APPROVED');
});

test('safe lock diagnostic identifies rejection without leaking connection secrets', () => {
  const ref = 'wjobcdjhqjirgyfbeuze';
  const valid = `postgresql://postgres.${ref}:TOP_SECRET@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require`;
  const env = {
    DATABASE_URL: valid,
    VERCEL_ENV: 'production', VERCEL: '1',
    NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
    GLOGGT_DOCUMENT_SET_CONFIRM_ENABLED: 'true',
    GLOGGT_DOCUMENT_SET_PRODUCTION_ENABLE: 'approved-manual-document-sets-v1',
    GLOGGT_DOCUMENT_SET_PRODUCTION_SCOPE: '8:2',
  };
  const scope = { companyId: 8, bankAccountId: 2 };
  assert.equal(exportsObj.documentSetStorageState(env, scope), 'READY');
  assert.equal(exportsObj.documentSetStorageState({ ...env, DATABASE_URL: valid.replace('sslmode=require', 'sslmode=disable') }, scope), 'PRODUCTION_DATABASE_TLS_REQUIRED');
  assert.equal(exportsObj.documentSetStorageState({ ...env, GLOGGT_DOCUMENT_SET_PRODUCTION_SCOPE: '8:3' }, scope), 'PRODUCTION_SCOPE_MISMATCH');
  assert.equal(exportsObj.documentSetStorageState({ ...env, GLOGGT_DOCUMENT_SET_CONFIRM_ENABLED: undefined }, scope), 'CONFIRM_SWITCH_OFF');
  assert.equal(exportsObj.documentSetStorageState({ ...env, NEXT_PUBLIC_SUPABASE_URL: 'https://invalid.example' }, scope), 'PRODUCTION_SUPABASE_PROJECT_MISMATCH');
  for (const result of ['READY', 'PRODUCTION_DATABASE_TLS_REQUIRED', 'PRODUCTION_SCOPE_MISMATCH']) {
    assert.equal(result.includes('TOP_SECRET'), false);
  }
});

test('Production writes require verified TLS on their PostgreSQL transaction', async t => {
  const originalEnvironment = sandbox.process.env.VERCEL_ENV;
  sandbox.process.env.VERCEL_ENV = 'production';
  t.after(() => {
    if (originalEnvironment === undefined) delete sandbox.process.env.VERCEL_ENV;
    else sandbox.process.env.VERCEL_ENV = originalEnvironment;
  });

  const queryText = strings => strings.join('?');
  const verify = rows => exportsObj.assertProductionDatabaseTls({
    $queryRaw: async strings => {
      assert.match(queryText(strings), /pg_catalog\.pg_stat_ssl/);
      assert.match(queryText(strings), /pg_catalog\.pg_backend_pid\(\)/);
      return rows;
    },
  });

  await verify([{ ssl: true }]);
  await assert.rejects(verify([{ ssl: false }]), /PRODUCTION_DATABASE_TLS_UNVERIFIED/);
  await assert.rejects(verify([]), /PRODUCTION_DATABASE_TLS_UNVERIFIED/);
  await assert.rejects(verify([{ ssl: null }]), /PRODUCTION_DATABASE_TLS_UNVERIFIED/);
  await assert.rejects(exportsObj.assertProductionDatabaseTls({
    $queryRaw: async () => { throw new Error('pg_stat_ssl unavailable'); },
  }), /pg_stat_ssl unavailable/);
});

test('non-Production writes do not require the Production TLS catalog check', async t => {
  const originalEnvironment = sandbox.process.env.VERCEL_ENV;
  delete sandbox.process.env.VERCEL_ENV;
  t.after(() => {
    if (originalEnvironment !== undefined) sandbox.process.env.VERCEL_ENV = originalEnvironment;
  });
  await exportsObj.assertProductionDatabaseTls({
    $queryRaw: async () => { throw new Error('unexpected catalog query'); },
  });
});

test('TLS verification precedes business reads in both write transactions', () => {
  const confirmBody = source.slice(source.indexOf('export async function confirmVisualDocumentSet'),
    source.indexOf('export async function voidVisualDocumentSet'));
  const voidBody = source.slice(source.indexOf('export async function voidVisualDocumentSet'));
  assert.match(confirmBody, /prisma\.\$transaction\(async tx => \{\s*await assertProductionDatabaseTls\(tx\);\s*const bank/);
  assert.match(voidBody, /prisma\.\$transaction\(async tx => \{\s*await assertProductionDatabaseTls\(tx\);\s*const group/);
});

test('local development requires the isolated flag, loopback and explicit test database name', () => {
  const local = 'postgresql://test:pass@127.0.0.1:55432/gloggt_test';
  assert.equal(enabled(local), false);
  assert.equal(enabled(local, { GLOGGT_DOCUMENT_SET_ISOLATED_LOCAL: 'true' }), true);
  assert.equal(enabled(local.replace('gloggt_test', 'postgres'), { GLOGGT_DOCUMENT_SET_ISOLATED_LOCAL: 'true' }), false);
  assert.equal(enabled(local.replace('127.0.0.1', '10.0.0.2'), { GLOGGT_DOCUMENT_SET_ISOLATED_LOCAL: 'true' }), false);
  assert.equal(enabled(local, {
    GLOGGT_DOCUMENT_SET_ISOLATED_LOCAL: 'true', NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co`,
  }), false);
});

test('voided sets preserve confirmation, documents, correction reason and time in read projection', async () => {
  db.financialReconciliation.findMany = async () => [
    {
      id: 15, status: 'CONFIRMED', confirmedAt: new Date('2026-11-05T11:00:00Z'), confirmedByUserId: 7,
      participants: [
        { sourceType: 'BANK_TRANSACTION', sourceKey: '328', role: 'MONEY_MOVEMENT', matchedAmount: 89146 },
        { sourceType: 'AI_DETECTED_DOCUMENT', sourceKey: '282', role: 'EVIDENCE', matchedAmount: 89146 },
      ],
    },
    {
      id: 14, status: 'VOID', confirmedAt: new Date('2026-11-05T09:00:00Z'), confirmedByUserId: 7,
      participants: [
        { sourceType: 'BANK_TRANSACTION', sourceKey: '328', role: 'MONEY_MOVEMENT', matchedAmount: 89146 },
        { sourceType: 'AI_DETECTED_DOCUMENT', sourceKey: '282', role: 'EVIDENCE', matchedAmount: 89146 },
      ],
    },
  ];
  db.aiDetectedDocument.findMany = async () => [{ id: 282, receiptId: 86, merchantName: 'Sjóvá', receipt: { description: '' } }];
  db.auditEvent.findMany = async () => [{ entityId: 14, description: 'Rangt fylgiskjal valið', createdAt: new Date('2026-11-05T10:00:00Z') }];
  const result = await exportsObj.getDocumentSetsWithHistory(8, 2);
  assert.equal(result.length, 2);
  assert.equal(result[0].status, 'CONFIRMED');
  assert.equal(result[1].status, 'VOID');
  assert.equal(result[1].voidReason, 'Rangt fylgiskjal valið');
  assert.equal(result[1].voidedAt, '2026-11-05T10:00:00.000Z');
  assert.equal(result[1].documents[0].receiptId, 86);
});


test('confirmed set reads the immutable snapshot and flags a later source revision', async () => {
  // A later OCR edit must not rewrite what the human actually confirmed.
  db.financialReconciliation.findMany = async () => [
    {
      id: 22, status: 'CONFIRMED', confirmedAt: new Date('2026-11-05T12:00:00Z'),
      confirmedByUserId: 7,
      metadata: { version: 'visual-document-set-v1', documents: [
        { documentId: 282, receiptId: 86, merchantName: 'Sjóvá upprunalegt',
          amount: '89146', contentRevision: 2, documentType: 'INVOICE' },
      ] },
      participants: [
        { sourceType: 'BANK_TRANSACTION', sourceKey: '328', role: 'MONEY_MOVEMENT', matchedAmount: 89146 },
        { sourceType: 'AI_DETECTED_DOCUMENT', sourceKey: '282', role: 'EVIDENCE', matchedAmount: 89146 },
      ],
    },
  ];
  db.aiDetectedDocument.findMany = async () => [{
    id: 282, receiptId: 86, merchantName: 'Nýr texti eftir OCR-breytingu',
    totalAmount: 89145, contentRevision: 3, receipt: { description: 'breytt' },
  }];
  db.auditEvent.findMany = async () => [];
  const result = await exportsObj.getDocumentSetsWithHistory(8, 2);
  assert.equal(result.length, 1);
  assert.equal(result[0].documents[0].title, 'Sjóvá upprunalegt');
  assert.equal(result[0].documents[0].amount, '89146');
  assert.equal(result[0].documents[0].sourceMissing, false);
  assert.equal(result[0].documents[0].changedSinceConfirmation, true);
});

test('missing source does not erase previously confirmed documentation', async () => {
  db.aiDetectedDocument.findMany = async () => [];
  const result = await exportsObj.getDocumentSetsWithHistory(8, 2);
  assert.equal(result.length, 1);
  assert.equal(result[0].documents[0].receiptId, 86);
  assert.equal(result[0].documents[0].title, 'Sjóvá upprunalegt');
  assert.equal(result[0].documents[0].sourceMissing, true);
  assert.equal(result[0].documents[0].changedSinceConfirmation, false);
});

test('changing the original receipt file flags a confirmed set even without a text revision', async () => {
  db.financialReconciliation.findMany = async () => [{
    id: 23, status: 'CONFIRMED', confirmedAt: new Date('2026-11-05T12:00:00Z'),
    confirmedByUserId: 7,
    metadata: { documents: [{ documentId: 282, receiptId: 86, merchantName: null,
      title: 'Upprunalega Sjóvá-skjal', amount: '89146', contentRevision: 2,
      receiptFileHash: 'old-original-file-hash' }] },
    participants: [
      { sourceType: 'BANK_TRANSACTION', sourceKey: '328', role: 'MONEY_MOVEMENT', matchedAmount: 89146 },
      { sourceType: 'AI_DETECTED_DOCUMENT', sourceKey: '282', role: 'EVIDENCE', matchedAmount: 89146 },
    ],
  }];
  db.aiDetectedDocument.findMany = async () => [{ id: 282, receiptId: 86,
    merchantName: 'Texti dagsins', contentRevision: 2,
    receipt: { description: 'Nýtt heiti', fileHash: 'new-replacement-file-hash' },
  }];
  const result = await exportsObj.getDocumentSetsWithHistory(8, 2);
  assert.equal(result[0].documents[0].changedSinceConfirmation, true);
  assert.equal(result[0].documents[0].title, 'Upprunalega Sjóvá-skjal');
  assert.equal(result[0].documents[0].amount, '89146');
});
