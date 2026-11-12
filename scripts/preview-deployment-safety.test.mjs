import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

// Run the actual policy code with mock variables, no remote connection.
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = fileURLToPath(new URL('../', import.meta.url));
const temp = mkdtempSync(join(tmpdir(), 'gloggt-preview-policy-'));
function transpile(name, output) {
  const src = readFileSync(join(root, 'lib/core', name), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText.replaceAll('"./verified-database-tls"', '"./verified-database-tls.mjs"');
  writeFileSync(join(temp, output), js);
}
transpile('verified-database-tls.ts', 'verified-database-tls.mjs');
transpile('preview-environment.ts', 'preview-environment.mjs');
const { assertSafeVercelPreviewEnvironment: check } =
  await import(pathToFileURL(join(temp, 'preview-environment.mjs')).href);

const fixture = readFileSync(join(root, 'scripts/verified-database-tls.test.mjs'), 'utf8');
const ca = fixture.match(/const TEST_CA = `([\s\S]*?)`;/)?.[1];
assert.ok(ca, 'local, synthetic CA fixture is available');
const CA_B64 = Buffer.from(ca, 'utf8').toString('base64');
const TEST_REF = 'rfvuzcchsaamrykpdiqm';
const PROD_REF = 'wjobcdjhqjirgyfbeuze';
const TEST_HOST = 'aws-0-eu-west-1.pooler.supabase.com';
const BASE = `postgresql://postgres.${TEST_REF}:placeholder@${TEST_HOST}:5432/postgres`;
const jwt = (ref, role) => `header.${Buffer.from(JSON.stringify({ ref, role })).toString('base64url')}.signature`;
const good = (override = {}) => ({
  VERCEL: '1', VERCEL_ENV: 'preview',
  DATABASE_URL: `${BASE}?sslmode=verify-full`,
  NEXT_PUBLIC_SUPABASE_URL: `https://${TEST_REF}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: jwt(TEST_REF, 'service_role'),
  ...override,
});
const accepts = env => assert.doesNotThrow(() => check(env));
const rejects = (env, pattern) => assert.throws(() => check(env), pattern);

test('Preview permits only the designated test project, including pooler tenant', () => {
  accepts(good());
  accepts(good({ DATABASE_URL: `postgresql://postgres:placeholder@db.${TEST_REF}.supabase.co:5432/postgres?sslmode=verify-full` }));
  rejects(good({ DATABASE_URL: `${BASE.replace(TEST_REF, PROD_REF)}?sslmode=verify-full` }), /approved Supabase project/);
  rejects(good({ DATABASE_URL: `postgresql://postgres:placeholder@db.${PROD_REF}.supabase.co:5432/postgres?sslmode=verify-full` }), /approved Supabase project/);
  rejects(good({ DATABASE_URL: `${BASE.replace('eu-west-1', 'eu-central-1')}?sslmode=verify-full` }), /approved Supabase project/);
});

test('Preview accepts CA-pinned adapter TLS when DATABASE_URL has no sslmode', () => {
  accepts(good({ DATABASE_URL: BASE, GLOGGT_PG_CA_PEM_B64: CA_B64 }));
  rejects(good({ DATABASE_URL: BASE }), /must require TLS/);
  rejects(good({ DATABASE_URL: BASE, GLOGGT_PG_CA_PEM_B64: 'bad' }), /must require TLS/);
});

test('Preview rejects weak, duplicate or conflicting TLS flags', () => {
  for (const mode of ['disable', 'prefer', 'allow', 'require', 'verify-ca']) {
    rejects(good({ DATABASE_URL: `${BASE}?sslmode=${mode}` }), /must require TLS/);
  }
  for (const mode of ['require', 'verify-ca']) {
    rejects(good({ DATABASE_URL: `${BASE}?sslmode=${mode}`, GLOGGT_PG_CA_PEM_B64: CA_B64 }), /CA-backed TLS configuration is invalid|must require TLS/);
  }
  rejects(good({ DATABASE_URL: `${BASE}?sslmode=verify-full&sslmode=verify-full` }), /must require TLS/);
  rejects(good({ DATABASE_URL: `${BASE}?sslmode=verify-full&sslrootcert=x` }), /unsupported connection override/);
});

test('Preview tests DIRECT_URL independently from adapter CA configuration', () => {
  rejects(good({ DIRECT_URL: `postgresql://postgres:placeholder@db.${PROD_REF}.supabase.co:5432/postgres?sslmode=verify-full` }), /approved Supabase project/);
  rejects(good({ DIRECT_URL: `postgresql://postgres:placeholder@db.${TEST_REF}.supabase.co:5432/postgres`, GLOGGT_PG_CA_PEM_B64: CA_B64 }), /must require TLS/);
  accepts(good({ DIRECT_URL: `postgresql://postgres:placeholder@db.${TEST_REF}.supabase.co:5432/postgres?sslmode=verify-full` }));
});

test('Preview rejects mismatched API project, integration keys and incomplete RLS mode', () => {
  rejects(good({ NEXT_PUBLIC_SUPABASE_URL: `https://${PROD_REF}.supabase.co` }), /approved project/);
  rejects(good({ SUPABASE_SERVICE_ROLE_KEY: jwt(PROD_REF, 'service_role') }), /authorized key/);
  rejects(good({ OPENAI_API_KEY: 'placeholder' }), /not permitted/);
  rejects(good({ SUPABASE_SECRET_KEY: 'placeholder' }), /not permitted/);
  rejects(good({ GLOGGT_PREVIEW_RLS_ENABLED: 'true' }), /unsupported in this release/);
});

test('Vercel without explicit environment fails closed; local and Production are unchanged', () => {
  rejects({ VERCEL: '1', DATABASE_URL: `${BASE}?sslmode=verify-full` }, /VERCEL_ENV must explicitly identify Preview/);
  accepts({ VERCEL_ENV: 'production', DATABASE_URL: 'production-managed-separately' });
  accepts({ DATABASE_URL: 'local-managed-separately' });
});

test('Both Prisma and Supabase adapters check Preview before constructing clients', () => {
  const prisma = readFileSync(join(root, 'lib/prisma.ts'), 'utf8');
  const supabase = readFileSync(join(root, 'lib/supabase.ts'), 'utf8');
  assert.match(prisma, /assertSafeVercelPreviewEnvironment\(\);\s*const adapter = new PrismaPg/s);
  assert.match(supabase, /assertSafeVercelPreviewEnvironment\(\);\s*const supabaseUrl/s);
});

test('Configuration rejection messages do not disclose credentials', () => {
  const marker = 'SYNTHETIC_SECRET_MARKER';
  assert.throws(() => check(good({ DATABASE_URL: BASE.replace('placeholder', marker) })), err => {
    assert.ok(!err.message.includes(marker)); return true;
  });
});
