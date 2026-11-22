/*
 * GLÖGGT: isolated in-memory lifecycle check for the REAL bank-owner and
 * own-account-transfer TypeScript services. Uses a stub Prisma transaction;
 * NO DB client, PostgreSQL connection, network access, or Production data.
 *
 * Run: node --test scripts/bank-owner-isolated-lifecycle.test.cjs
 * Requires the project's existing `typescript` dependency.
 * This is not a substitute for a PostgreSQL trigger/TLS integration test.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const rootFile = (filename) => path.join(root, filename);
const read = (filename) => fs.readFileSync(rootFile(filename), 'utf8');
const sourcePaths = {
  ownerPolicy: 'lib/personal-finance/bank-account-owner-policy.ts',
  personPolicy: 'lib/personal-finance/private-person-registry-policy.ts',
  transferPolicy: 'lib/personal-finance/own-transfer-policy.ts',
  ownerService: 'lib/financial-reconciliation/bank-account-owner-service.ts',
  transferService: 'lib/financial-reconciliation/own-account-transfer-service.ts',
};
for (const filename of Object.values(sourcePaths)) {
  assert.ok(fs.existsSync(rootFile(filename)), `Missing source: ${filename}`);
}

function loadTs(filename, stubs) {
  const output = ts.transpileModule(read(filename), {
    fileName: filename,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: false,
    },
  }).outputText;
  const module = { exports: {} };
  const isolatedRequire = (specifier) => {
    if (Object.hasOwn(stubs, specifier)) return stubs[specifier];
    if (specifier === 'server-only') return {};
    if (specifier === 'node:crypto') return require('node:crypto');
    throw Error(`BLOCKED_DEPENDENCY: ${specifier}`);
  };
  new Function('require', 'module', 'exports', 'process', output)(
    isolatedRequire, module, module.exports, { env: Object.freeze({}) },
  );
  return module.exports;
}

const ownerPolicy = loadTs(sourcePaths.ownerPolicy, {});
const personPolicy = loadTs(sourcePaths.personPolicy, {});
const transferPolicy = loadTs(sourcePaths.transferPolicy, {});
const mockPrismaApi = {
  TransactionIsolationLevel: { Serializable: 'Serializable' },
  PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {},
};

class Amount {
  constructor(value) { this.value = value; }
  toString() { return String(this.value); }
  abs() { return new Amount(Math.abs(this.value)); }
}

/** All IDs synthetic and deliberately different from Production examples. */
function initialState() {
  return {
    accounts: [
      { id: 1201, companyId: 801, isActive: true },
      { id: 1301, companyId: 801, isActive: true },
      { id: 9901, companyId: 999, isActive: true },
    ],
    transactions: [
      { id: 44001, bankAccountId: 1201, date: new Date('2026-01-02T12:00:00.000Z'), amount: -20000, status: 'UNRECONCILED' },
      { id: 44002, bankAccountId: 1301, date: new Date('2026-01-02T12:00:00.000Z'), amount: 20000, status: 'UNRECONCILED' },
    ],
    companies: [{ id: 801, name: 'Sýnidæmi ehf.', isActive: true }],
    persons: [{ id: 901, companyId: 801, entityType: 'PERSON', status: 'ACTIVE',
      metadata: { privatePersonRegistry: 'v1', privatePersonCategory: 'OTHER' } }],
    auditEvents: [],
    reconciliations: [],
    claims: [],
    classifications: [],
    payments: [],
    nextAuditId: 1,
    nextReconciliationId: 1,
    ledgerWrites: 0,
  };
}

function fixture({ failSecondStatusUpdate = false } = {}) {
  let state = initialState();
  const observations = { isolationLevels: [], locks: [], queries: [] };
  function findAccount(id) { return state.accounts.find(a => a.id === id); }
  function selectTransaction(id, companyId) {
    const t = state.transactions.find(t => t.id === id);
    const account = t && findAccount(t.bankAccountId);
    if (!t || !account || account.companyId !== companyId || !account.isActive) return null;
    return { ...t, amount: new Amount(t.amount) };
  }
  function txFactory() {
    return {
      async $queryRaw(parts, ...values) {
        const sql = parts.join('?');
        observations.queries.push(sql);
        if (/"BankAccount"/.test(sql)) {
          const isList = /\bIN\s*\(/.test(sql);
          const ids = isList ? values.slice(0, 2) : [values[0]];
          const companyId = isList ? values[2] : values[1];
          observations.locks.push(['BankAccount', ...ids]);
          return state.accounts.filter(a => ids.includes(a.id) && a.companyId === companyId &&
            (!/"isActive" = true/.test(sql) || a.isActive)).map(a => ({ id: a.id }));
        }
        if (/"BankTransaction"/.test(sql)) {
          const ids = values.slice(0, 2);
          observations.locks.push(['BankTransaction', ...ids]);
          return state.transactions.filter(t => ids.includes(t.id)).map(t => ({ id: t.id }));
        }
        if (/to_regclass\(/.test(sql)) return [{ present: true }];
        if (/FROM public\."BankAllocationClaim"/.test(sql)) {
          return state.claims.filter(c => values.includes(c.bankTransactionId));
        }
        throw Error(`UNEXPECTED_SQL_IN_ISOLATED_TEST: ${sql}`);
      },
      company: {
        async findFirst({ where }) {
          return state.companies.find(c => c.id === where.id && c.isActive === where.isActive) ?? null;
        },
      },
      insightEntity: {
        async findFirst({ where }) {
          return state.persons.find(p => p.id === where.id && p.companyId === where.companyId &&
            p.entityType === where.entityType && p.status === where.status) ?? null;
        },
      },
      auditEvent: {
        async findFirst({ where }) {
          const events = state.auditEvents.filter(e => e.companyId === where.companyId &&
            e.entityType === where.entityType && e.entityId === where.entityId &&
            where.action.in.includes(e.action));
          return events.sort((a, b) => b.id - a.id)[0] ?? null;
        },
        async create({ data }) {
          const row = { id: state.nextAuditId++, ...data };
          state.auditEvents.push(row);
          return { id: row.id };
        },
      },
      bankTransaction: {
        async findMany({ where }) {
          return where.id.in.map(id => selectTransaction(id, where.bankAccount.companyId))
            .filter(Boolean);
        },
        async updateMany({ where, data }) {
          if (failSecondStatusUpdate && where.id === 44002 && data.status === 'RECONCILED') {
            return { count: 0 };
          }
          const t = state.transactions.find(t => t.id === where.id &&
            t.bankAccountId === where.bankAccountId && t.status === where.status);
          if (!t) return { count: 0 };
          Object.assign(t, data);
          return { count: 1 };
        },
      },
      financialReconciliationParticipant: {
        async findFirst({ where }) {
          const sourceKeys = where.sourceKey.in;
          const excluded = where.reconciliation.id?.not;
          const existing = state.reconciliations.find(rec => rec.companyId === where.reconciliation.companyId &&
            rec.status !== 'VOID' && rec.id !== excluded && rec.participants.some(p =>
              p.sourceType === where.sourceType && sourceKeys.includes(p.sourceKey)));
          return existing ? { id: existing.id } : null;
        },
      },
      financialEventPayment: {
        async findFirst({ where }) {
          return state.payments.find(p => where.bankTransactionId.in.includes(p.bankTransactionId)) ?? null;
        },
      },
      financialSourceClassification: {
        async findMany({ where }) {
          return state.classifications.filter(c => c.companyId === where.companyId &&
            c.sourceType === where.sourceType && where.sourceKey.in.includes(c.sourceKey));
        },
      },
      financialReconciliation: {
        async create({ data }) {
          const row = { ...data, id: state.nextReconciliationId++, participants: data.participants.create };
          state.reconciliations.push(row);
          // Simulate the V3 trigger's sticky ORDINARY claims for the VOID path.
          for (const p of row.participants) state.claims.push({ bankTransactionId: Number(p.sourceKey), kind: 'ORDINARY' });
          return { id: row.id };
        },
        async findFirst({ where }) {
          return state.reconciliations.find(rec => rec.id === where.id &&
            rec.companyId === where.companyId && rec.reconciliationType === where.reconciliationType &&
            rec.status === where.status) ?? null;
        },
        async updateMany({ where, data }) {
          const rec = state.reconciliations.find(rec => rec.id === where.id &&
            rec.companyId === where.companyId && rec.status === where.status);
          if (!rec) return { count: 0 };
          Object.assign(rec, data);
          return { count: 1 };
        },
      },
    };
  }
  const prisma = {
    async $transaction(callback, options) {
      assert.equal(options.isolationLevel, 'Serializable', 'writes must use SERIALIZABLE');
      observations.isolationLevels.push(options.isolationLevel);
      const before = structuredClone(state);
      try { return await callback(txFactory()); }
      catch (error) { state = before; throw error; }
    },
  };
  const ownerService = loadTs(sourcePaths.ownerService, {
    '@/app/generated/prisma/client': { Prisma: mockPrismaApi },
    '@/lib/prisma': { prisma },
    '@/lib/personal-finance/private-person-registry-policy': personPolicy,
    '@/lib/personal-finance/bank-account-owner-policy': ownerPolicy,
  });
  const transferService = loadTs(sourcePaths.transferService, {
    '@/app/generated/prisma/client': { Prisma: mockPrismaApi },
    '@/lib/prisma': { prisma },
    '@/lib/financial-reconciliation/bank-account-owner-service': ownerService,
    '@/lib/personal-finance/own-transfer-policy': {
      ...transferPolicy,
      ownTransferStorageEnabled: () => true, // Forces isolated mode, never an external DB.
      ownTransferAccountReady: () => true,
      ownTransferScopedStorageEnabled: () => true,
    },
    '@/lib/financial-reconciliation/bank-allocation-contract': {
      assertVerifiedBankAllocationContract: () => { throw Error('PRODUCTION_GUARD_MUST_NOT_BE_CALLED'); },
    },
    '@/lib/core/verified-database-tls': {
      prismaPgConnectionOptions: () => { throw Error('EXTERNAL_TLS_CLIENT_FORBIDDEN'); },
    },
    pg: { Client: class Client { constructor() { throw Error('PG_CLIENT_FORBIDDEN'); } } },
  });
  const auth = { companyId: 801, userId: 77 };
  const accountOwner = (bankAccountId, ownerKind = 'COMPANY', ownerId = 801) => ({
    ...auth, bankAccountId, ownerKind, ownerId,
    evidenceKind: 'NETBANK', ownershipAttested: true,
  });
  const transfer = () => ({ ...auth, bankAccountId: 1201,
    sourceId: 44001, targetId: 44002, ownershipAttested: true });
  return { ownerService, transferService, accountOwner, transfer,
    get state() { return state; }, observations };
}

const errorCode = (message) => ({ message });

test('staðfestir báða reikninga og eina eigin millifærslu, án bókunar eða tvítalningar', async () => {
  const f = fixture();
  await assert.rejects(f.transferService.confirmOwnAccountTransfer(f.transfer()), errorCode('BANK_ACCOUNT_OWNER_UNVERIFIED'));
  assert.equal(f.state.auditEvents.length, 0);
  await f.ownerService.confirmBankAccountOwner(f.accountOwner(1201));
  await assert.rejects(f.transferService.confirmOwnAccountTransfer(f.transfer()), errorCode('BANK_ACCOUNT_OWNER_UNVERIFIED'));
  await f.ownerService.confirmBankAccountOwner(f.accountOwner(1301));
  const match = await f.ownerService.assertCommonConfirmedBankAccountOwner(
    /* read-only synthetic tx checked inside service transaction below */
    { $queryRaw: (strings, ...values) => {
      const sql = strings.join('?');
      assert.match(sql, /"BankAccount"/);
      assert.deepEqual(values, [1201, 1301, 801]);
      return [{ id: 1201 }, { id: 1301 }];
    },
    auditEvent: { findFirst: ({where}) => f.state.auditEvents.filter(a =>
      a.companyId === where.companyId && a.entityId === where.entityId &&
      where.action.in.includes(a.action)).at(-1) },
    company: { findFirst: () => ({ id: 801 }) },
    insightEntity: { findFirst: () => null },
    }, 801, 1201, 1301,
  );
  assert.equal(match.ownerId, 801);
  const result = await f.transferService.confirmOwnAccountTransfer(f.transfer());
  assert.equal(result.id, 1);
  assert.equal(f.state.reconciliations.length, 1);
  const rec = f.state.reconciliations[0];
  assert.equal(rec.status, 'CONFIRMED');
  assert.equal(rec.reconciliationType, 'BANK_TO_BANK_OWN_TRANSFER');
  assert.equal(rec.participants.length, 2);
  assert.deepEqual(rec.participants.map(p => p.sourceKey).sort(), ['44001', '44002']);
  assert.deepEqual(rec.metadata.verifiedAccountOwner, {
    ownerKind: 'COMPANY', ownerId: 801, evidenceAuditIds: [1, 2],
  });
  assert.deepEqual(f.state.transactions.map(t => t.status), ['RECONCILED', 'RECONCILED']);
  assert.equal(f.state.payments.length, 0);
  assert.equal(f.state.ledgerWrites, 0);
  assert.equal(f.state.auditEvents.filter(e => e.action === 'CONFIRM_BANK_TO_BANK_OWN_TRANSFER').length, 1);
  await assert.rejects(f.transferService.confirmOwnAccountTransfer(f.transfer()), errorCode('ALREADY_RECONCILED'));
  assert.equal(f.state.reconciliations.length, 1);
  assert.ok(f.observations.isolationLevels.every(v => v === 'Serializable'));
});

test('afturköllun eigandastaðfestingar stöðvar nýja pörun, saga varðveitist', async () => {
  const f = fixture();
  await f.ownerService.confirmBankAccountOwner(f.accountOwner(1201));
  await f.ownerService.confirmBankAccountOwner(f.accountOwner(1301));
  await f.ownerService.revokeBankAccountOwner({ companyId: 801, userId: 77, bankAccountId: 1301,
    reason: 'Réttur eigandi var skráður ranglega.' });
  await assert.rejects(f.transferService.confirmOwnAccountTransfer(f.transfer()), errorCode('BANK_ACCOUNT_OWNER_UNVERIFIED'));
  assert.equal(f.state.auditEvents.length, 3);
  assert.equal(f.state.reconciliations.length, 0);
  // A fresh attestation is required; an old confirmation cannot revive itself.
  await f.ownerService.confirmBankAccountOwner(f.accountOwner(1301));
  const result = await f.transferService.confirmOwnAccountTransfer(f.transfer());
  assert.equal(result.id, 1);
  assert.deepEqual(f.state.reconciliations[0].metadata.verifiedAccountOwner.evidenceAuditIds, [1, 4]);
});

test('aðskildir eigendur, rangur leigjandi og óskráður einstaklingur banna pörun', async () => {
  const f = fixture();
  await f.ownerService.confirmBankAccountOwner(f.accountOwner(1201));
  await f.ownerService.confirmBankAccountOwner(f.accountOwner(1301, 'PRIVATE_PERSON', 901));
  await assert.rejects(f.transferService.confirmOwnAccountTransfer(f.transfer()), errorCode('BANK_ACCOUNT_OWNER_UNVERIFIED'));
  assert.equal(f.state.reconciliations.length, 0);
  await assert.rejects(f.ownerService.confirmBankAccountOwner(f.accountOwner(9901)), errorCode('NOT_FOUND'));
  await assert.rejects(f.ownerService.confirmBankAccountOwner(f.accountOwner(1301, 'PRIVATE_PERSON', 9999)), errorCode('BANK_ACCOUNT_OWNER_UNVERIFIED'));
  assert.equal(f.state.auditEvents.length, 2);
});

test('vantar heimild, staðfestingu eða rök: hvorki eigandaskrá né afstemming breytist', async () => {
  const f = fixture();
  await assert.rejects(f.ownerService.confirmBankAccountOwner({ ...f.accountOwner(1201), ownershipAttested: false }),
    errorCode('OWNERSHIP_NOT_ATTESTED'));
  await assert.rejects(f.ownerService.confirmBankAccountOwner({ ...f.accountOwner(1201), evidenceKind: 'BANK_TEXT' }),
    errorCode('OWNERSHIP_NOT_ATTESTED'));
  await assert.rejects(f.ownerService.revokeBankAccountOwner({ companyId: 801, userId: 77, bankAccountId: 1201, reason: 'Stutt' }),
    errorCode('REASON_REQUIRED'));
  assert.equal(f.state.auditEvents.length, 0);
  assert.equal(f.state.reconciliations.length, 0);
  assert.deepEqual(f.state.transactions.map(t => t.status), ['UNRECONCILED', 'UNRECONCILED']);
});

test('afstemming afturkölluð: báðar hreyfingar endurstilltar og V3-tilkall helst', async () => {
  const f = fixture();
  await f.ownerService.confirmBankAccountOwner(f.accountOwner(1201));
  await f.ownerService.confirmBankAccountOwner(f.accountOwner(1301));
  const created = await f.transferService.confirmOwnAccountTransfer(f.transfer());
  await f.transferService.voidOwnAccountTransfer({ companyId: 801, userId: 77, bankAccountId: 1201,
    reconciliationId: created.id, reason: 'Villan leiðrétt með afturköllun.' });
  assert.deepEqual(f.state.transactions.map(t => t.status), ['UNRECONCILED', 'UNRECONCILED']);
  assert.equal(f.state.reconciliations[0].status, 'VOID');
  assert.equal(f.state.auditEvents.filter(e => e.action === 'VOID_BANK_TO_BANK_OWN_TRANSFER').length, 1);
  assert.equal(f.state.claims.length, 2, 'sticky claims remain after VOID');
  await assert.rejects(f.transferService.confirmOwnAccountTransfer(f.transfer()), errorCode('ALREADY_RECONCILED'));
  assert.equal(f.state.reconciliations.length, 1);
});


test('samkeppnisárekstur: eldri V3-tilkall eða flokkun stöðvar pörun', async () => {
  const claimed = fixture();
  await claimed.ownerService.confirmBankAccountOwner(claimed.accountOwner(1201));
  await claimed.ownerService.confirmBankAccountOwner(claimed.accountOwner(1301));
  claimed.state.claims.push({ bankTransactionId: 44002, kind: 'FAMILY' });
  await assert.rejects(claimed.transferService.confirmOwnAccountTransfer(claimed.transfer()), errorCode('ALREADY_RECONCILED'));
  assert.equal(claimed.state.reconciliations.length, 0);
  const classified = fixture();
  await classified.ownerService.confirmBankAccountOwner(classified.accountOwner(1201));
  await classified.ownerService.confirmBankAccountOwner(classified.accountOwner(1301));
  classified.state.classifications.push({ companyId: 801, sourceType: 'BANK_TRANSACTION', sourceKey: '44002', classification: 'LOAN' });
  await assert.rejects(classified.transferService.confirmOwnAccountTransfer(classified.transfer()), errorCode('CLASSIFICATION_CONFLICT'));
  assert.equal(classified.state.reconciliations.length, 0);
});

test('SERIALIZABLE afturkallar hlutaskrif ef seinni bankahreyfing bilar', async () => {
  const f = fixture({ failSecondStatusUpdate: true });
  await f.ownerService.confirmBankAccountOwner(f.accountOwner(1201));
  await f.ownerService.confirmBankAccountOwner(f.accountOwner(1301));
  await assert.rejects(f.transferService.confirmOwnAccountTransfer(f.transfer()), errorCode('ALREADY_RECONCILED'));
  assert.equal(f.state.reconciliations.length, 0);
  assert.equal(f.state.claims.length, 0);
  assert.deepEqual(f.state.transactions.map(t => t.status), ['UNRECONCILED', 'UNRECONCILED']);
  assert.equal(f.state.auditEvents.length, 2);
});
