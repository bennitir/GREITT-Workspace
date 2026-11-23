import test from 'node:test';
import assert from 'node:assert/strict';
import { rootCertificates } from 'node:tls';
import { readFileSync } from 'node:fs';
import { ownTransferSelectionStatus, ownTransferStorageEnabled } from '../lib/personal-finance/own-transfer-policy.ts';
const base = {
  sourceId: 330, targetId: 1801, sourceAccountId: 2, targetAccountId: 13,
  sourceDate: new Date('2026-01-02T00:00:00Z'), targetDate: new Date('2026-01-02T00:00:00Z'),
  sourceAmount: '-20000', targetAmount: '20000', sourceStatus: 'UNRECONCILED', targetStatus: 'UNRECONCILED',
  ownershipAttested: true,
};
const policy = delta => ownTransferSelectionStatus({ ...base, ...delta });
test('reikningar eiganda stemma aðeins eftir mannsstaðfestingu', () => assert.equal(policy({}), null));
test('bankatexti/nöfn eru ekki staðfest eignarhald', () => assert.equal(policy({ownershipAttested:false}), 'OWNERSHIP_NOT_ATTESTED'));
test('enginn tenging innan sama bankareiknings', () => assert.equal(policy({targetAccountId:2}), 'ACCOUNT_NOT_DISTINCT'));
test('sama hreyfing má ekki vera báðar hliðar', () => assert.equal(policy({targetId:330}), 'INVALID_SELECTION'));
test('aðrar upphæðir stöðva pörun', () => assert.equal(policy({targetAmount:'19999.99'}), 'AMOUNT_OR_DATE_MISMATCH'));
test('nákvæm formerki eru nauðsynleg', () => assert.equal(policy({targetAmount:'-20000'}), 'AMOUNT_OR_DATE_MISMATCH'));
test('öll gagnstæð formerki virka frá báðum reikningum', () => assert.equal(policy({sourceAmount:'20000',targetAmount:'-20000'}), null));
test('yfir þrír dagar stöðva', () => assert.equal(policy({targetDate:new Date('2026-01-06T00:00:00Z')}), 'AMOUNT_OR_DATE_MISMATCH'));
test('staðfest fyrri afstemming er varðveitt', () => assert.equal(policy({targetStatus:'RECONCILED'}), 'ALREADY_RECONCILED'));
test('vörnin er óvirk án heimildar', () => assert.equal(ownTransferStorageEnabled({}), false));
const local = {GLOGGT_OWN_TRANSFER_CONFIRM_ENABLED:'true', DATABASE_URL:'postgresql://v03_reconciliation_runtime_20261031:dummy@127.0.0.1:55432/gloggt_v03_reconciliation_test_20261031'};
test('eina heimilaða skrifleiðin er afmarkaður local V03', () => assert.equal(ownTransferStorageEnabled(local), true));
test('Supabase/Production er aldrei heimilt', () => {
 assert.equal(ownTransferStorageEnabled({...local, VERCEL_ENV:'production'}), false);
 assert.equal(ownTransferStorageEnabled({...local, DATABASE_URL:'postgresql://v03_reconciliation_runtime_20261031:dummy@aws-0-eu-west-1.pooler.supabase.com:5432/postgres'}), false);
 assert.equal(ownTransferStorageEnabled({...local, DATABASE_URL:'postgresql://v03_reconciliation_runtime_20261031:dummy@localhost:55432/production'}), false);
 assert.equal(ownTransferStorageEnabled({...local, DATABASE_URL:'postgresql://v03_reconciliation_runtime_20261031:dummy@localhost:55432/gloggt_v03_reconciliation_test_20261031?host=other'}), false);
});

import { ownTransferAccountReady, ownTransferScopedStorageEnabled } from '../lib/personal-finance/own-transfer-policy.ts';
const prodScope = { companyId: 8, bankAccountId: 2, sourceId: 330, targetId: 1801 };
const prodURL = 'postgresql://postgres.wjobcdjhqjirgyfbeuze:dummy@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=verify-full';
const prod = {
  NODE_ENV: 'production', VERCEL_ENV: 'production', VERCEL: '1',
  GLOGGT_OWN_TRANSFER_CONFIRM_ENABLED: 'true',
  GLOGGT_OWN_TRANSFER_PRODUCTION_APPROVAL: 'reviewed-single-own-transfer-v1',
  GLOGGT_OWN_TRANSFER_PRODUCTION_SCOPE: '8:2:330:1801',
  NEXT_PUBLIC_SUPABASE_URL: 'https://wjobcdjhqjirgyfbeuze.supabase.co',
  DATABASE_URL: prodURL,
};
const canWrite = (changedEnv = {}, changedScope = {}) => ownTransferScopedStorageEnabled(
  { ...prod, ...changedEnv }, { ...prodScope, ...changedScope });

test('eina fyrirfram afmarkaða Production-pörunin gæti fengið skrifheimild eftir sérsamþykki', () => {
  assert.equal(canWrite(), true);
  assert.equal(canWrite({}, {sourceId: 1801, targetId: 330}), true);
  assert.equal(ownTransferAccountReady(prod, { companyId: 8, bankAccountId: 2 }), true);
});
test('óvirkt sjálfgefið, samþykki eða flögg vantar', () => {
  assert.equal(canWrite({GLOGGT_OWN_TRANSFER_CONFIRM_ENABLED:undefined}), false);
  assert.equal(canWrite({GLOGGT_OWN_TRANSFER_PRODUCTION_APPROVAL:undefined}), false);
  assert.equal(canWrite({GLOGGT_OWN_TRANSFER_PRODUCTION_SCOPE:undefined}), false);
  assert.equal(canWrite({GLOGGT_OWN_TRANSFER_PRODUCTION_SCOPE:'8:2:330:330'}), false);
  assert.equal(canWrite({GLOGGT_OWN_TRANSFER_PRODUCTION_SCOPE:'8:2:330:1801:999'}), false);
});
test('enginn annar reikningur, fyrirtæki né bankafærsla heimiluð', () => {
  assert.equal(canWrite({}, {companyId: 9}), false);
  assert.equal(canWrite({}, {bankAccountId: 3}), false);
  assert.equal(canWrite({}, {sourceId: 331}), false);
  assert.equal(canWrite({}, {targetId: 1802}), false);
  assert.equal(ownTransferAccountReady(prod, {companyId:9,bankAccountId:2}),false);
});
test('localhost tengt Supabase er skrifvarið nema sérstakt annað samþykki liggi fyrir', () => {
  assert.equal(canWrite({VERCEL_ENV:undefined,VERCEL:undefined,NODE_ENV:'development'}), false);
  assert.equal(canWrite({VERCEL_ENV:undefined,VERCEL:undefined,NODE_ENV:'development', GLOGGT_OWN_TRANSFER_LOCAL_PRODUCTION_APPROVAL:'reviewed-local-production-single-pair-v1'}), true);
  assert.equal(canWrite({VERCEL_ENV:undefined,VERCEL:undefined,NODE_ENV:'production', GLOGGT_OWN_TRANSFER_LOCAL_PRODUCTION_APPROVAL:'reviewed-local-production-single-pair-v1'}), false);
  assert.equal(canWrite({VERCEL_ENV:'preview'}), false);
  assert.equal(canWrite({VERCEL:undefined}), false);
});
test('rangt Supabase-verkefni eða ógildur notandi stöðvar', () => {
  assert.equal(canWrite({NEXT_PUBLIC_SUPABASE_URL:'https://another.supabase.co'}), false);
  assert.equal(canWrite({DATABASE_URL:prodURL.replace('wjobcdjhqjirgyfbeuze','another')}), false);
  assert.equal(canWrite({DATABASE_URL:prodURL.replace('postgres.wjobcdjhqjirgyfbeuze','postgres')}), false);
  assert.equal(canWrite({DIRECT_URL:prodURL.replace('wjobcdjhqjirgyfbeuze','other')}), false);
});
test('TLS verification is mandatory for approved Production pair', () => {
  assert.equal(canWrite({DATABASE_URL:prodURL.replace('verify-full','require')}), false);
  assert.equal(canWrite({DATABASE_URL:prodURL.replace('?sslmode=verify-full','')}), false);
  assert.equal(canWrite({DATABASE_URL:prodURL + '&host=localhost'}), false);
  assert.equal(canWrite({DATABASE_URL:prodURL + '&sslmode=verify-full'}), false);
});
test('no production pair can be authorized without explicit IDs', () => {
  assert.equal(ownTransferScopedStorageEnabled(prod), false);
  assert.equal(ownTransferScopedStorageEnabled(prod, {companyId:8, bankAccountId:2}), false);
});
test('eldri staðbundin V03 leið heldur áfram að virka', () => {
  assert.equal(ownTransferAccountReady(local), true);
  assert.equal(ownTransferScopedStorageEnabled(local, prodScope), true);
  assert.equal(ownTransferScopedStorageEnabled({...local, GLOGGT_OWN_TRANSFER_CONFIRM_ENABLED:undefined}, prodScope), false);
});

// PostgreSQL numeric(65,30) retains fractional trailing zeroes; aurar precision
// must remain exact and never round a true third fractional digit.
test('PostgreSQL NUMERIC með 30 núllum eftir kommu er sama fjárhæð', () => {
  assert.equal(policy({sourceAmount:'-20000.000000000000000000000000000000',targetAmount:'20000.000000000000000000000000000000'}), null);
});
test('núll eftir tveimur gildum aukastöfum hafa ekki áhrif', () => {
  assert.equal(policy({sourceAmount:'-20000.250000000000',targetAmount:'20000.25'}), null);
});
test('raunverulegur þriðji aukastafur er alltaf hafnaður', () => {
  assert.equal(policy({sourceAmount:'-20000.001000000',targetAmount:'20000.001000000'}), 'AMOUNT_OR_DATE_MISMATCH');
});
test('pörun má ekki námunda ólíkar fjárhæðir', () => {
  assert.equal(policy({sourceAmount:'-20000.000000000000',targetAmount:'19999.999999999999999999'}), 'AMOUNT_OR_DATE_MISMATCH');
});
test('of langar eða vísindalegar tölur hafnað', () => {
  assert.equal(policy({sourceAmount:'-1e4'}), 'AMOUNT_OR_DATE_MISMATCH');
  assert.equal(policy({sourceAmount:'9'.repeat(105)}), 'AMOUNT_OR_DATE_MISMATCH');
});

const validCA = Buffer.from(rootCertificates.find(pem => pem.includes('BEGIN CERTIFICATE'))).toString('base64');
test('sérstaklega staðfest CA leyfir URL án sslmode, ekki ein sér skrif', () => {
  const env = { ...prod, DATABASE_URL: prodURL.replace('?sslmode=verify-full',''), GLOGGT_PG_CA_PEM_B64: validCA };
  assert.equal(ownTransferScopedStorageEnabled(env, prodScope), true);
  assert.equal(ownTransferScopedStorageEnabled({...env,GLOGGT_OWN_TRANSFER_CONFIRM_ENABLED:undefined}, prodScope), false);
});
test('CA af handahófi eða SSL require án verify-full er bannað', () => {
  assert.equal(canWrite({DATABASE_URL:prodURL.replace('?sslmode=verify-full',''),GLOGGT_PG_CA_PEM_B64:'bm90LWEtdHJ1c3RlZC1jYQ=='}), false);
  assert.equal(canWrite({DATABASE_URL:prodURL.replace('verify-full','require'),GLOGGT_PG_CA_PEM_B64:validCA}), false);
  assert.equal(canWrite({DATABASE_URL:prodURL.replace('verify-full','disable'),GLOGGT_PG_CA_PEM_B64:validCA}), false);
});
test('production þjónustan krefst staðfestrar pg TLS-handabandar en ekki eingöngu pg_stat_ssl gegnum pooler', () => {
  const service = readFileSync(new URL('../lib/financial-reconciliation/own-account-transfer-service.ts', import.meta.url),'utf8');
  assert.match(service,/socket\?\.encrypted !== true \|\| socket\?\.authorized !== true/);
  assert.match(service,/if \(!isPooler\) \{/);
  assert.match(service,/prismaPgConnectionOptions\(\)/);
});
