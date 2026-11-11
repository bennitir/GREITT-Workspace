import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prismaPgConnectionOptions, hasVerifiedCaTlsConfigWithoutUrlMode } from '../lib/core/verified-database-tls.ts';
import { readFileSync } from 'node:fs';

// Disposable local CA fixture. Not Supabase's certificate; no network calls.
const TEST_CA = `-----BEGIN CERTIFICATE-----
MIIDMzCCAhugAwIBAgIUJlEVynfsjDmLvM/SY7nxnDGaZ6AwDQYJKoZIhvcNAQEL
BQAwKTEnMCUGA1UEAwweR0zDg8KWR0dUIE9mZmxpbmUgVGVzdCBSb290IENBMB4X
DTI2MTEwOTEwMDMwN1oXDTM2MTEwNjEwMDMwN1owKTEnMCUGA1UEAwweR0zDg8KW
R0dUIE9mZmxpbmUgVGVzdCBSb290IENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A
MIIBCgKCAQEApfrdEd502jlyc8oMgkpSUeVkLEwF+GqNuGy68mW7Fn0TOYg0edvm
G8fKdVAcjM6XlnCZsjdVpwyZZIPqcyLuIcN3L+Kl2El28NXuKkg9TjPv/QkyhOmO
PO9A/jKz+A1C0T/D5E91X8Ojfgjd2eZiHW1dUjKS+Bj/LjdJzFGqDTfOClA1mXMz
79Ut/5k3C7yJ5+Wr8xn/7mgypff0lA8lwKHg/zznHU+gbZELiBJYXmEZmWYxCYQ8
xZl2yl8+nCCw/sNEj9cs1AFCdK7bnxC3VRWocJsxlc0Uc0qlqKpK69PCRX5jMyJQ
uaFwLeb6NZ3GmYpe7MT9Nh0vv2g/Gh/uLwIDAQABo1MwUTAdBgNVHQ4EFgQU5TOL
uz3xZpjtozMRbplqIv0gh0MwHwYDVR0jBBgwFoAU5TOLuz3xZpjtozMRbplqIv0g
h0MwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAGx8UntrjAOC9
wztSK1T9wRwkLsnEfzJxlISE66wE7L5oEvVvmyvzM3y+aOkRGlpPkP+UYpO8e8AU
Z5bNhN9qUyHDkTwVfBgCRKptJ2zyKxT5kCYyoiISgV0yNBYn1c0CdxpSe9gHhlXY
w0jiBzYrOyXDQgkRYVoG38a3X+y4Sx525w/twYA14H8x/A9IG5BIpP83D3cV1qvC
4gWv1zlLV4X922FlQGFEp8Gmpb3BdceNLfHnAbkjKLS/wSrQWulq7P+FDcsasx86
A6+uOvXi6Kzf7QMII9+6X/G31nr2ZnbIquOGtif0waP3RRWax9weXLXZnLmG69sU
RKM7NZ+o7Q==
-----END CERTIFICATE-----
`;
const CA_B64 = Buffer.from(TEST_CA, 'utf8').toString('base64');
const BASE = 'postgresql://example-user:example-password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';
const secureEnv = (url = `${BASE}?sslmode=verify-full`) => ({
  DATABASE_URL: url,
  GLOGGT_PG_CA_PEM_B64: CA_B64,
});

test('without explicit CA opt-in: leaves the existing connection behavior unchanged', () => {
  const original = `${BASE}?application_name=gloggt`;
  assert.deepEqual(prismaPgConnectionOptions({ DATABASE_URL: original }), { connectionString: original });
});

test('valid CA: adapter-only URL is stripped of sslmode; TLS identity validation remains on', () => {
  const raw = `${BASE}?application_name=gloggt&sslmode=verify-full`;
  const result = prismaPgConnectionOptions(secureEnv(raw));
  assert.equal(new URL(raw).searchParams.get('sslmode'), 'verify-full');
  assert.equal(new URL(result.connectionString).searchParams.has('sslmode'), false);
  assert.equal(new URL(result.connectionString).searchParams.get('application_name'), 'gloggt');
  assert.deepEqual(result.ssl, {
    ca: TEST_CA,
    rejectUnauthorized: true,
    servername: 'aws-0-eu-west-1.pooler.supabase.com',
  });
});

test('rejects duplicated or weaker sslmode with CA enabled', () => {
  for (const suffix of ['?sslmode=require', '?sslmode=verify-ca',
    '?sslmode=disable', '?sslmode=verify-full&sslmode=verify-full']) {
    assert.throws(() => prismaPgConnectionOptions(secureEnv(BASE + suffix)), /GLOGGT_PG_TLS_URL_INVALID/);
  }
});

test('rejects ssl settings which could replace the explicitly configured CA', () => {
  for (const param of ['ssl=false', 'sslrootcert=/tmp/malicious.crt', 'sslcert=x', 'sslkey=x',
    'uselibpqcompat=true', 'host=example.net', 'hostaddr=127.0.0.1', 'options=-cfoo', 'service=other']) {
    assert.throws(() => prismaPgConnectionOptions(secureEnv(`${BASE}?sslmode=verify-full&${param}`)),
      /GLOGGT_PG_TLS_URL_INVALID/);
  }
});

test('rejects malformed connection string and fragment', () => {
  for (const raw of ['not-a-url', `${BASE}?sslmode=verify-full#fragment`,
    'https://example.org/db?sslmode=verify-full']) {
    assert.throws(() => prismaPgConnectionOptions(secureEnv(raw)), /GLOGGT_PG_TLS_URL_INVALID/);
  }
});

test('rejects empty, malformed and non-CA trust material', () => {
  for (const value of ['', '***', Buffer.from('not a certificate').toString('base64')]) {
    assert.throws(() => prismaPgConnectionOptions({ DATABASE_URL: `${BASE}?sslmode=verify-full`,
      GLOGGT_PG_CA_PEM_B64: value }), /GLOGGT_PG_TLS_CA_INVALID/);
  }
});

test('does not expose credential or CA text in errors', () => {
  const marker = 'TOPSECRET-TEST-ONLY';
  const badUrl = `${BASE.replace('example-password', marker)}?sslmode=require`;
  assert.throws(() => prismaPgConnectionOptions(secureEnv(badUrl)), error => {
    assert.equal(error.message, 'GLOGGT_PG_TLS_URL_INVALID');
    assert.ok(!error.message.includes(marker));
    return true;
  });
});

test('missing DATABASE_URL retains original error', () => {
  assert.throws(() => prismaPgConnectionOptions({}), /DATABASE_URL vantar/);
});


test('explicit CA is a verified TLS option even with no URL sslmode', () => {
  const original = BASE;
  const env = secureEnv(original);
  const config = prismaPgConnectionOptions(env);
  assert.equal(env.DATABASE_URL, original);
  assert.equal(config.ssl?.rejectUnauthorized, true);
  assert.equal(config.ssl?.servername, new URL(BASE).hostname);
  assert.equal(hasVerifiedCaTlsConfigWithoutUrlMode(env), true);
});

test('alternate policy rejects missing CA, invalid CA, disable, prefer and unverified modes', () => {
  assert.equal(hasVerifiedCaTlsConfigWithoutUrlMode({ DATABASE_URL: BASE }), false);
  assert.equal(hasVerifiedCaTlsConfigWithoutUrlMode({ DATABASE_URL: BASE, GLOGGT_PG_CA_PEM_B64: 'bad' }), false);
  for (const mode of ['disable', 'prefer', 'require', 'verify-ca', 'verify-full']) {
    assert.equal(hasVerifiedCaTlsConfigWithoutUrlMode(secureEnv(`${BASE}?sslmode=${mode}`)), false);
  }
});

test('production document-set gate includes the CA-backed alternative', () => {
  const source = readFileSync(new URL('../lib/financial-reconciliation/document-set-service.ts', import.meta.url), 'utf8');
  assert.match(source, /hasVerifiedCaTlsConfigWithoutUrlMode\(env\)/);
  assert.match(source, /isSupabaseConnection\(conn, productionRef, 'postgres', verifiedCaWithoutUrlMode\)/);
  assert.match(source, /if \(!SUPABASE_REQUIRED_TLS_MODES\.includes\(conn\.sslmode \?\? ''\) && !verifiedCaWithoutUrlMode\)/);
  assert.match(source, /await assertProductionDatabaseTls\(tx\)/);
});

// Execute the actual pure storage-state function without importing the Prisma
// runtime, which would otherwise open application modules unrelated to the gate.
test('production storage state requires approved identity, scope and CA-backed TLS', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const source = readFileSync(new URL('../lib/financial-reconciliation/document-set-service.ts', import.meta.url), 'utf8');
  const begin = source.indexOf('type DocumentSetScope =');
  const end = source.indexOf('export const documentSetStorageEnabled =');
  assert.ok(begin >= 0 && end > begin);
  const js = ts.transpileModule(source.slice(begin, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function('module', 'exports', 'URL', 'hasVerifiedCaTlsConfigWithoutUrlMode', js)(
    module, module.exports, URL, hasVerifiedCaTlsConfigWithoutUrlMode,
  );
  const storageState = module.exports.documentSetStorageState;
  const prodUrl = 'postgresql://postgres.wjobcdjhqjirgyfbeuze:example-password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres';
  const env = {
    DATABASE_URL: prodUrl,
    GLOGGT_PG_CA_PEM_B64: CA_B64,
    GLOGGT_DOCUMENT_SET_CONFIRM_ENABLED: 'true',
    VERCEL_ENV: 'production', VERCEL: '1',
    GLOGGT_DOCUMENT_SET_PRODUCTION_ENABLE: 'approved-manual-document-sets-v1',
    GLOGGT_DOCUMENT_SET_PRODUCTION_SCOPE: '1:2',
    NEXT_PUBLIC_SUPABASE_URL: 'https://wjobcdjhqjirgyfbeuze.supabase.co',
  };
  const scope = { companyId: 1, bankAccountId: 2 };
  assert.equal(storageState(env, scope), 'READY');
  assert.equal(storageState({ ...env, GLOGGT_PG_CA_PEM_B64: undefined }, scope), 'PRODUCTION_DATABASE_TLS_REQUIRED');
  assert.equal(storageState({ ...env, DATABASE_URL: `${prodUrl}?sslmode=disable` }, scope), 'PRODUCTION_DATABASE_TLS_REQUIRED');
  assert.equal(storageState({ ...env, GLOGGT_PG_CA_PEM_B64: 'bad' }, scope), 'PRODUCTION_DATABASE_TLS_REQUIRED');
  assert.equal(storageState({ ...env, DATABASE_URL: prodUrl.replace('postgres.wjobcdjhqjirgyfbeuze', 'postgres.not-the-project') }, scope), 'PRODUCTION_DATABASE_ROLE_NOT_APPROVED');
  assert.equal(storageState({ ...env, DATABASE_URL: prodUrl.replace('aws-0-eu-central-1.pooler.supabase.com', 'evil.example') }, scope), 'PRODUCTION_DATABASE_HOST_OR_PORT_NOT_APPROVED');
  assert.equal(storageState(env, { companyId: 2, bankAccountId: 2 }), 'PRODUCTION_SCOPE_MISMATCH');
  assert.equal(storageState({ ...env, DIRECT_URL: prodUrl }, scope), 'PRODUCTION_DIRECT_CONNECTION_NOT_APPROVED');
});
