'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const root = path.resolve(__dirname, '..');
function load(relative, env) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, relative), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports, module, process: { env }, Response, Headers,
    URL, console,
    require(name) {
      if (name === 'next/server') return require(name);
      throw new Error(`Unexpected dependency access: ${name}`);
    },
  }, { filename: relative });
  return module.exports;
}
const cookies = [undefined, 'sessionToken=invalid-test-session; activeCompanyId=1'];
const environments = [
  { NODE_ENV: 'production' },
  { NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production' },
  { NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'preview' },
  { NODE_ENV: 'development', VERCEL: '1' },
  {},
];
for (const route of ['health', 'audit', 'access-audit']) {
  test(`${route}: hosted/production/unknown environments deny before database import`, async () => {
    for (const env of environments) for (const cookie of cookies) {
      const { GET } = load(`app/api/dev-bridge/${route}/route.ts`, env);
      const request = new Request(`https://example.invalid/api/dev-bridge/${route}`, { headers: cookie ? { cookie } : {} });
      const response = await GET(request);
      assert.equal(response.status, 404);
      assert.equal(await response.text(), 'Not found');
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
    }
  });
  test(`${route}: actual proxy + handler denies absent and forged session`, async () => {
    const env = { NODE_ENV: 'production', VERCEL: '1' };
    const { proxy } = load('proxy.ts', env);
    const { GET } = load(`app/api/dev-bridge/${route}/route.ts`, env);
    for (const cookie of cookies) {
      const request = new NextRequest(`https://example.invalid/api/dev-bridge/${route}`, { headers: cookie ? { cookie } : {} });
      const gate = proxy(request);
      const response = gate.headers.get('x-middleware-next') === '1' ? await GET(request) : gate;
      assert.equal(response.status, cookie ? 404 : 307);
      if (!cookie) assert.equal(new URL(response.headers.get('location')).pathname, '/innskraning');
    }
  });
}
test('health remains available only in explicit local development', async () => {
  const { GET } = load('app/api/dev-bridge/health/route.ts', { NODE_ENV: 'development' });
  assert.equal((await GET()).status, 200);
});