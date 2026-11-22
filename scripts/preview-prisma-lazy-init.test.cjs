'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '..', 'lib', 'prisma.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
assert.match(source, /export const prisma: PrismaClient = new Proxy\(/);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
}).outputText;

let allow = false;
let guards = 0;
let adapters = 0;
let clients = 0;
let tlsCalls = 0;
class FakeAdapter {
  constructor(options) { adapters++; assert.deepEqual(options, { ssl: 'verified' }); }
}
class FakeClient {
  constructor({ adapter }) {
    assert.ok(adapter instanceof FakeAdapter);
    clients++;
    this.bankAccount = { findMany: () => 'read-only-stub' };
  }
  $transaction() {
    assert.ok(this instanceof FakeClient, 'Prisma method must be bound to real client');
    return 'transaction-method-stub';
  }
}
const modules = {
  '@prisma/adapter-pg': { PrismaPg: FakeAdapter },
  '../app/generated/prisma/client': { PrismaClient: FakeClient },
  './core/preview-environment': {
    assertSafeVercelPreviewEnvironment() {
      guards++;
      if (!allow) throw new Error('Vercel Preview configuration rejected: mock forbidden URL.');
    },
  },
  './core/verified-database-tls': {
    prismaPgConnectionOptions() { tlsCalls++; return { ssl: 'verified' }; },
  },
};
const moduleExports = {};
const context = vm.createContext({ exports: moduleExports, require: name => {
  assert.ok(Object.prototype.hasOwnProperty.call(modules, name), `Unexpected import: ${name}`);
  return modules[name];
}});
new vm.Script(compiled, { filename: 'lib/prisma.ts' }).runInContext(context);
const prisma = moduleExports.prisma;
assert.ok(prisma, 'Prisma export must exist');
assert.deepEqual({ guards, adapters, clients, tlsCalls }, { guards: 0, adapters: 0, clients: 0, tlsCalls: 0 }, 'Build-time import must stay inert');
assert.throws(() => prisma.bankAccount, /Vercel Preview configuration rejected/);
assert.deepEqual({ guards, adapters, clients, tlsCalls }, { guards: 1, adapters: 0, clients: 0, tlsCalls: 0 }, 'Blocked Preview must not initialize a client');
allow = true;
assert.equal(prisma.bankAccount.findMany(), 'read-only-stub');
assert.equal(prisma.$transaction(), 'transaction-method-stub');
assert.deepEqual({ adapters, clients, tlsCalls }, { adapters: 1, clients: 1, tlsCalls: 1 }, 'Allowed environment must use one client');
allow = false;
assert.throws(() => prisma.bankAccount, /Vercel Preview configuration rejected/);
assert.equal(clients, 1, 'Cached client must not evade validation');
console.log('STENST: Import without DB, Preview rejection before adapter, authorized access, singleton and cached-client guard.');
