'use strict';
// Regression: older confirmed reconcilations may use different participant roles.
// No database, environment secrets, or external connections are used.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const src = fs.readFileSync(path.join(__dirname, '../lib/financial-reconciliation/document-set-service.ts'), 'utf8');
const code = ts.transpileModule(src, {
  fileName: 'document-set-service.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(code.diagnostics?.length ?? 0, 0);

class Decimal {
  constructor(value) { this.value = Number(value); }
  isZero() { return this.value === 0; }
  abs() { return new Decimal(Math.abs(this.value)); }
  eq(other) { return this.value === other.value; }
  add(other) { return new Decimal(this.value + other.value); }
  toString() { return String(this.value); }
}

function setup({ legacyBank = false, legacyDocument = false } = {}) {
  let writes = 0;
  const bankId = 329, documentId = 328;
  const tx = {
    bankTransaction: {
      async findFirst() { return { id: bankId, status: 'UNRECONCILED', amount: new Decimal(-901) }; },
      async updateMany() { writes++; return { count: 1 }; },
    },
    financialReconciliation: {
      async findMany(args) {
        const filter = args.where.participants.some;
        if (legacyBank && filter.sourceType === 'BANK_TRANSACTION' && filter.sourceKey === '329' &&
            (filter.role === undefined || filter.role === 'LEGACY_ROLE')) {
          return [{ id: 105, reconciliationType: 'BANK_TO_REVIEWED_DOCUMENT', participants: [
            { sourceType: 'BANK_TRANSACTION', sourceKey: '329', role: 'LEGACY_ROLE' },
            { sourceType: 'AI_DETECTED_DOCUMENT', sourceKey: '17', role: 'OTHER' },
          ] }];
        }
        return [];
      },
      async create() { writes++; return { id: 201 }; },
    },
    aiDetectedDocument: {
      async findMany() { return [{
        id: documentId, receiptId: 5, merchantName: 'Sjóvá', receiptNumber: null,
        totalAmount: 901, reviewedAt: new Date(), reviewedContentRevision: 1,
        contentRevision: 1, duplicateMarkedAt: null, needsAttentionAt: null,
        documentType: 'INVOICE', documentRole: 'PRIMARY', receipt: { description: 'Sjóvá', fileHash: 'h' },
        financialEventLinks: [],
      }]; },
    },
    financialReconciliationParticipant: {
      async findMany(args) {
        const filter = args.where;
        if (legacyDocument && filter.sourceType === 'AI_DETECTED_DOCUMENT' &&
            filter.sourceKey.in.includes('328') && (filter.role === undefined || filter.role === 'LEGACY_ROLE')) {
          return [{ sourceKey: '328' }];
        }
        return [];
      },
    },
    financialEventPayment: { async findFirst() { return null; } },
    auditEvent: { async create() { writes++; return { id: 1 }; } },
    async $queryRaw() { return [{ present: false }]; },
  };
  const db = { $transaction: f => f(tx) };
  const exportsObj = {};
  const env = {
    DATABASE_URL: 'postgresql://runner:fake@127.0.0.1:55432/gloggt_test',
    GLOGGT_DOCUMENT_SET_CONFIRM_ENABLED: 'true',
    GLOGGT_DOCUMENT_SET_ISOLATED_LOCAL: 'true',
  };
  const sandbox = { exports: exportsObj, process: { env }, URL, Date,
    require(name) {
      if (name === 'server-only') return {};
      if (name === '@/app/generated/prisma/client') return { Prisma: {
        Decimal, PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {}, TransactionIsolationLevel: { Serializable: 'Serializable' },
      } };
      if (name === '@/lib/prisma') return { prisma: db };
      throw new Error('Unexpected module: ' + name);
    },
  };
  vm.runInNewContext(code.outputText, sandbox, { filename: 'document-set-service.js' });
  return { service: exportsObj, writes: () => writes };
}
const input = { companyId: 8, bankAccountId: 2, bankTransactionId: 329, userId: 13, documentIds: [328] };

test('already confirmed bank participant with legacy role is blocked, even if bank status is stale', async () => {
  const { service, writes } = setup({ legacyBank: true });
  await assert.rejects(service.confirmVisualDocumentSet(input), e => e.message === 'SAMSTAEDA_BANKI_THEGAR_STADFESTUR');
  assert.equal(writes(), 0);
});

test('previously confirmed document with legacy role cannot be used for another bank movement', async () => {
  const { service, writes } = setup({ legacyDocument: true });
  await assert.rejects(service.confirmVisualDocumentSet(input), e => e.message === 'SAMSTAEDA_SKJAL_THEGAR_TENGT');
  assert.equal(writes(), 0);
});

test('truly unclaimed and reviewed document can be confirmed with audit', async () => {
  const { service, writes } = setup();
  const result = await service.confirmVisualDocumentSet(input);
  assert.equal(result.id, 201);
  assert.equal(result.idempotent, false);
  assert.equal(writes(), 3);
});
