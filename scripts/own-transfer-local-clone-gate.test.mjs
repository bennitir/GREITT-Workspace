import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ownTransferStorageEnabled,
  ownTransferAccountReady,
  ownTransferScopedStorageEnabled,
} from '../lib/personal-finance/own-transfer-policy.ts';

const LOCAL = {
  NODE_ENV: 'development',
  GLOGGT_OWN_TRANSFER_CONFIRM_ENABLED: 'true',
  GLOGGT_OWN_TRANSFER_LOCAL_FIXTURE: 'reviewed-isolated-fixture-20261123',
  GLOGGT_OWN_TRANSFER_LOCAL_FIXTURE_SCOPE: '8:1000000001:1000000002:1000000003',
  DATABASE_URL: 'postgresql://gloggt_local_own_transfer_app_20261123:dummy@127.0.0.1:55434/gloggt_local_own_transfer_20261123',
};
const account = {companyId:8,bankAccountId:1000000001};
const pair = {...account,sourceId:1000000002,targetId:1000000003};
const check = (env, scope=pair) => ownTransferScopedStorageEnabled(env, scope);

test('new local clone is fail-closed with no explicit fixture opt-in', () => {
  assert.equal(check({...LOCAL,GLOGGT_OWN_TRANSFER_LOCAL_FIXTURE:undefined}), false);
  assert.equal(check({...LOCAL,GLOGGT_OWN_TRANSFER_CONFIRM_ENABLED:undefined}), false);
  assert.equal(ownTransferStorageEnabled({...LOCAL,GLOGGT_OWN_TRANSFER_LOCAL_FIXTURE:undefined}), false);
});

test('ONLY the pinned synthetic scope is locally authorized', () => {
  assert.equal(check(LOCAL), true);
  assert.equal(check(LOCAL,{...pair,sourceId:pair.targetId,targetId:pair.sourceId}), true);
  assert.equal(ownTransferStorageEnabled(LOCAL), true);
  assert.equal(ownTransferAccountReady(LOCAL,account),true);
  assert.equal(ownTransferAccountReady(LOCAL,{...account,bankAccountId:2}),false);
  assert.equal(check(LOCAL,{...pair,sourceId:330}), false);
  assert.equal(check(LOCAL,{...pair,targetId:1801}),false);
  assert.equal(check(LOCAL,{...pair,bankAccountId:2}),false);
  assert.equal(check(LOCAL,{...pair,companyId:9}),false);
});

test('not on Vercel, Production or non-development process', () => {
  for (const env of [{VERCEL:'1'},{VERCEL_ENV:'production'},{NODE_ENV:'production'}]) {
    assert.equal(check({...LOCAL,...env}),false);
  }
});

test('not on ANY other database, user, host or port', () => {
  for (const raw of [
    'postgresql://gloggt_local_own_transfer_app_20261123:dummy@127.0.0.1:5432/gloggt_local_own_transfer_20261123',
    'postgresql://gloggt_local_own_transfer_app_20261123:dummy@localhost:55434/gloggt_local_own_transfer_20261123',
    'postgresql://restore_admin:dummy@127.0.0.1:55434/gloggt_local_own_transfer_20261123',
    'postgresql://gloggt_local_own_transfer_app_20261123:dummy@127.0.0.1:55434/postgres',
    'postgresql://gloggt_local_own_transfer_app_20261123:dummy@127.0.0.1:55434/gloggt_local_own_transfer_20261123?host=evil',
  ]) assert.equal(check({...LOCAL,DATABASE_URL:raw}),false);
  assert.equal(check({...LOCAL,DIRECT_URL:'postgresql://postgres:dummy@db.example.com:5432/postgres'}),false);
});

test('not when Supabase or other nonlocal credentials are available', () => {
  for(const field of ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','GLOGGT_PG_CA_PEM_B64']) {
    assert.equal(check({...LOCAL,[field]:'anything'}),false,field);
  }
});

test('not for ordinary transaction IDs or malformed fixture settings', () => {
  for (const val of [
    '8:2:330:1801', '8:1000000001:1000000002:1000000002',
    '8:1000000001:1000000002', '8:1000000001:1000000002:garbage',
  ]) assert.equal(check({...LOCAL,GLOGGT_OWN_TRANSFER_LOCAL_FIXTURE_SCOPE:val}),false);
});
