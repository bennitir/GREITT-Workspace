import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ownTransferAccountReady,
  ownTransferScopedStorageEnabled,
  ownTransferSelectionStatus,
} from '../lib/personal-finance/own-transfer-policy.ts';

const REF = 'wjobcdjhqjirgyfbeuze';
const base = Object.freeze({
  VERCEL: '1',
  VERCEL_ENV: 'production',
  GLOGGT_OWN_TRANSFER_CONFIRM_ENABLED: 'true',
  GLOGGT_OWN_TRANSFER_PRODUCTION_APPROVAL: 'reviewed-company-own-transfer-v1',
  GLOGGT_OWN_TRANSFER_PRODUCTION_SCOPE: '8',
  DATABASE_URL: `postgresql://postgres.${REF}:not-real@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`,
  NEXT_PUBLIC_SUPABASE_URL: `https://${REF}.supabase.co`,
});
const account = { companyId: 8, bankAccountId: 2 };
const pair = { ...account, sourceId: 330, targetId: 1801 };
const ready = (env, scope=account) => ownTransferAccountReady(env, scope);
const enabled = (env, scope=pair) => ownTransferScopedStorageEnabled(env, scope);

test('company approval accepts arbitrary distinct transaction IDs within one company', () => {
  assert.equal(ready(base), true);
  assert.equal(ready(base, {companyId:8,bankAccountId:13}), true);
  assert.equal(enabled(base), true);
  assert.equal(enabled(base, { ...pair, sourceId: 845, targetId: 984 }), true);
  assert.equal(enabled(base, { ...pair, sourceId: 1801, targetId: 330 }), true);
});

test('other company and malformed account IDs are rejected', () => {
  assert.equal(ready(base, {companyId:9,bankAccountId:2}), false);
  assert.equal(ready(base, {companyId:8,bankAccountId:0}), false);
  assert.equal(enabled(base, { ...pair, companyId:9 }), false);
  assert.equal(enabled(base, { ...pair, bankAccountId:-2 }), false);
});

test('invalid, equal, zero or nonsafe movement IDs rejected', () => {
  assert.equal(enabled(base, { ...pair, sourceId:330, targetId:330 }), false);
  assert.equal(enabled(base, { ...pair, sourceId:0 }), false);
  assert.equal(enabled(base, { ...pair, targetId:Number.MAX_SAFE_INTEGER+1 }), false);
});

test('production and master switch must both be explicit', () => {
  assert.equal(ready({ ...base, VERCEL_ENV:'preview' }), false);
  assert.equal(enabled({ ...base, VERCEL:'0' }), false);
  assert.equal(enabled({ ...base, GLOGGT_OWN_TRANSFER_CONFIRM_ENABLED:'false' }), false);
  assert.equal(enabled({ ...base, GLOGGT_OWN_TRANSFER_PRODUCTION_APPROVAL:undefined }), false);
});

test('company-scoped approval cannot be used locally against Production', () => {
  assert.equal(ready({ ...base, VERCEL:undefined, VERCEL_ENV:undefined, NODE_ENV:'development' }), false);
});

test('company scope strictly accepts a single positive company ID', () => {
  for (const scope of ['8:2:330:1801','8,9','0','08','-8','9999999999999999999999999','']) {
    assert.equal(enabled({ ...base, GLOGGT_OWN_TRANSFER_PRODUCTION_SCOPE:scope }), false, scope);
  }
});

test('incorrect project and downgraded URL are rejected', () => {
  assert.equal(enabled({...base,NEXT_PUBLIC_SUPABASE_URL:'https://wrong.supabase.co'}), false);
  assert.equal(enabled({...base,DATABASE_URL:base.DATABASE_URL.replace('verify-full','require')}), false);
  assert.equal(enabled({...base,DATABASE_URL:base.DATABASE_URL.replace('postgres.'+REF,'postgres.other-project')}), false);
});

test('legacy one-pair approval stays narrowly scoped', () => {
  const legacy={ ...base,
    GLOGGT_OWN_TRANSFER_PRODUCTION_APPROVAL:'reviewed-single-own-transfer-v1',
    GLOGGT_OWN_TRANSFER_PRODUCTION_SCOPE:'8:2:330:1801',
  };
  assert.equal(enabled(legacy), true);
  assert.equal(enabled(legacy,{...pair,sourceId:900,targetId:901}),false);
  assert.equal(enabled(legacy,{...pair,bankAccountId:13}),false);
});

test('general matching policy still requires human attestation and opposite amounts', () => {
  const specimen={ sourceId:330,targetId:1801,sourceAccountId:2,targetAccountId:13,
    sourceDate:new Date('2026-01-02T12:00:00Z'),targetDate:new Date('2026-01-02T12:00:00Z'),
    sourceAmount:'-20000.000000000',targetAmount:'20000.000000000',
    sourceStatus:'UNRECONCILED',targetStatus:'UNRECONCILED',ownershipAttested:true };
  assert.equal(ownTransferSelectionStatus(specimen),null);
  assert.equal(ownTransferSelectionStatus({...specimen,ownershipAttested:false}),'OWNERSHIP_NOT_ATTESTED');
  assert.equal(ownTransferSelectionStatus({...specimen,targetAmount:'19000'}),'AMOUNT_OR_DATE_MISMATCH');
  assert.equal(ownTransferSelectionStatus({...specimen,targetAccountId:2}),'ACCOUNT_NOT_DISTINCT');
  assert.equal(ownTransferSelectionStatus({...specimen,targetStatus:'RECONCILED'}),'ALREADY_RECONCILED');
});


test('fail closed when CA is missing, invalid or direct URL points elsewhere', () => {
  const noMode = base.DATABASE_URL.replace('?sslmode=verify-full', '');
  assert.equal(enabled({...base, DATABASE_URL:noMode}), false);
  assert.equal(enabled({...base, DATABASE_URL:noMode, GLOGGT_PG_CA_PEM_B64:'not-base64'}), false);
  assert.equal(enabled({...base, DIRECT_URL:'postgresql://postgres:example@db.other.supabase.co:5432/postgres?sslmode=verify-full'}), false);
});

test('V03 production-like local approval cannot grant company-wide permissions', () => {
  assert.equal(enabled({...base,VERCEL:undefined, VERCEL_ENV:undefined,NODE_ENV:'development',GLOGGT_OWN_TRANSFER_LOCAL_PRODUCTION_APPROVAL:'reviewed-local-production-single-pair-v1'}),false);
});
