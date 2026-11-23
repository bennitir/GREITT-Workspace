import { X509Certificate } from 'node:crypto';

/** Deterministic policy for a human-reviewed transfer between two own accounts.
 * It NEVER infers ownership from the bank text, matching amount, or account name.
 */
export type OwnTransferBlock = 'INVALID_SELECTION' | 'AMOUNT_OR_DATE_MISMATCH' | 'ACCOUNT_NOT_DISTINCT' | 'ALREADY_RECONCILED' | 'OWNERSHIP_NOT_ATTESTED';

export function ownTransferSelectionStatus(input: {
  sourceId: number; targetId: number; sourceAccountId: number; targetAccountId: number;
  sourceDate: Date; targetDate: Date; sourceAmount: string; targetAmount: string;
  sourceStatus: string; targetStatus: string; ownershipAttested: boolean;
}): OwnTransferBlock | null {
  if (![input.sourceId, input.targetId, input.sourceAccountId, input.targetAccountId]
    .every(v => Number.isSafeInteger(v) && v > 0) || input.sourceId === input.targetId) return 'INVALID_SELECTION';
  if (input.sourceAccountId === input.targetAccountId) return 'ACCOUNT_NOT_DISTINCT';
  if (input.sourceStatus !== 'UNRECONCILED' || input.targetStatus !== 'UNRECONCILED') return 'ALREADY_RECONCILED';
  if (!input.ownershipAttested) return 'OWNERSHIP_NOT_ATTESTED';
  // Prisma/PostgreSQL DECIMAL may format exact ISK 20,000 as
  // "20000.000000000000000000000000000000". Strip only trailing zeroes:
  // actual fractional aurar beyond two decimal places remain forbidden.
  const units = (raw: string): bigint | null => {
    const value = raw.trim();
    if (value.length > 100) return null;
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value);
    if (!match) return null;
    const fraction = (match[3] ?? '').replace(/0+$/, '');
    if (fraction.length > 2) return null;
    const amount = BigInt(match[2]) * BigInt(100) + BigInt(fraction.padEnd(2, '0') || '0');
    return match[1] ? -amount : amount;
  };
  const left = units(input.sourceAmount), right = units(input.targetAmount);
  if (left === null || right === null || left === BigInt(0) || left + right !== BigInt(0)) return 'AMOUNT_OR_DATE_MISMATCH';
  if (!Number.isFinite(input.sourceDate.getTime()) || !Number.isFinite(input.targetDate.getTime())) return 'AMOUNT_OR_DATE_MISMATCH';
  const day = (v: Date) => Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  if (Math.abs(day(input.sourceDate) - day(input.targetDate)) > 3 * 86400000) return 'AMOUNT_OR_DATE_MISMATCH';
  return null;
}

/** Deliberately OFF by default; NEVER enabled for Supabase/Production.
 * Local-only runtime is a code-development write gate, not proof of user ownership.
 */
export function ownTransferStorageEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.GLOGGT_OWN_TRANSFER_CONFIRM_ENABLED === 'true' &&
    (approvedIsolatedV03(env) || approvedIsolatedLocalFixture(env) !== null);
}

/** The ONE approved bank-account and bank-movement pair. This metadata is not secret.
 * IMPORTANT: merely installing the code does not grant permission to write.
 */
export type OwnTransferScope = {
  companyId: number;
  bankAccountId: number;
  sourceId: number;
  targetId: number;
};

type OwnTransferAccountScope = Pick<OwnTransferScope, 'companyId' | 'bankAccountId'>;

/** The existing local V03 acceptance gate is intentionally unchanged. */
function approvedIsolatedV03(env: Readonly<Record<string, string | undefined>>): boolean {
  if (env.VERCEL || env.VERCEL_ENV) return false;
  try {
    const url = new URL(env.DATABASE_URL || '');
    return ['postgres:', 'postgresql:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1'].includes(url.hostname.toLowerCase()) && url.port === '55432' &&
      decodeURIComponent(url.pathname.slice(1)) === 'gloggt_v03_reconciliation_test_20261031' &&
      decodeURIComponent(url.username) === 'v03_reconciliation_runtime_20261031' &&
      Boolean(url.password) && !url.hash &&
      !['host', 'hostaddr', 'service', 'options'].some(k => url.searchParams.has(k));
  } catch { return false; }
}

/**
 * Temporary, opt-in local acceptance for ONE synthetic bank-to-bank pair.
 * The restored historic rows remain excluded by reserved high test IDs.
 * Only the already-created local clone may be used. This gate must never
 * be enabled by .env, Vercel, Production, or a browser flag.
 *
 * IMPORTANT: runtime must be launched with a separate low-privilege local DB
 * user, no Supabase credentials, and explicit fixture scope. This does NOT
 * create fixtures or give blanket permission to change copied history.
 */
const LOCAL_FIXTURE_DB = 'gloggt_local_own_transfer_20261123';
const LOCAL_FIXTURE_DB_USER = 'gloggt_local_own_transfer_app_20261123';
const LOCAL_FIXTURE_TOKEN = 'reviewed-isolated-fixture-20261123';
const LOCAL_FIXTURE_MIN_ID = 1000000000;

type LocalFixtureScope = {
  companyId: number;
  bankAccountId: number;
  firstId: number;
  secondId: number;
};

function localFixtureDbUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return ['postgres:', 'postgresql:'].includes(url.protocol) &&
      url.hostname === '127.0.0.1' && url.port === '55434' &&
      decodeURIComponent(url.pathname.slice(1)) === LOCAL_FIXTURE_DB &&
      decodeURIComponent(url.username) === LOCAL_FIXTURE_DB_USER &&
      Boolean(url.password) && !url.hash && !url.search;
  } catch { return false; }
}

function approvedIsolatedLocalFixture(
  env: Readonly<Record<string, string | undefined>>,
): LocalFixtureScope | null {
  if (env.VERCEL !== undefined || env.VERCEL_ENV !== undefined ||
      env.NODE_ENV !== 'development' ||
      env.GLOGGT_OWN_TRANSFER_CONFIRM_ENABLED !== 'true' ||
      env.GLOGGT_OWN_TRANSFER_LOCAL_FIXTURE !== LOCAL_FIXTURE_TOKEN ||
      !localFixtureDbUrl(env.DATABASE_URL) ||
      (env.DIRECT_URL !== undefined && !localFixtureDbUrl(env.DIRECT_URL)) ||
      env.GLOGGT_PG_CA_PEM_B64 || env.SUPABASE_URL ||
      env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_SERVICE_ROLE_KEY ||
      env.SUPABASE_ANON_KEY) return null;
  const values = (env.GLOGGT_OWN_TRANSFER_LOCAL_FIXTURE_SCOPE ?? '').split(':');
  if (values.length !== 4 || values.some(value => !/^[1-9]\d*$/.test(value))) return null;
  const [companyId, bankAccountId, firstId, secondId] = values.map(Number);
  if (![companyId, bankAccountId, firstId, secondId].every(Number.isSafeInteger) ||
      companyId <= 0 || bankAccountId < LOCAL_FIXTURE_MIN_ID ||
      firstId < LOCAL_FIXTURE_MIN_ID || secondId < LOCAL_FIXTURE_MIN_ID ||
      firstId === secondId) return null;
  return { companyId, bankAccountId, firstId, secondId };
}

const APPROVAL = 'reviewed-single-own-transfer-v1';
// Separate company-wide approval: no hardcoded individual transaction IDs.
// This is an interim rollout gate; the long-term control belongs on the
// company configuration in GLÖGGT, not in Vercel environment variables.
const COMPANY_APPROVAL = 'reviewed-company-own-transfer-v1';
const LOCAL_PRODUCTION_APPROVAL = 'reviewed-local-production-single-pair-v1';
const PRODUCTION_REF = 'wjobcdjhqjirgyfbeuze';
const SHARED_POOLER = /^aws-[0-9]+-[a-z]{2}-[a-z]+-[0-9]+\.pooler\.supabase\.com$/;

type Approval = { companyId: number; bankAccountId: number; firstId: number; secondId: number };
type CompanyApproval = { mode: 'COMPANY'; companyId: number };

function approvedPair(env: Readonly<Record<string, string | undefined>>): Approval | null {
  if (env.GLOGGT_OWN_TRANSFER_PRODUCTION_APPROVAL !== APPROVAL) return null;
  const parts = (env.GLOGGT_OWN_TRANSFER_PRODUCTION_SCOPE || '').split(':');
  if (parts.length !== 4 || parts.some(s => !/^[1-9]\d*$/.test(s))) return null;
  const [companyId, bankAccountId, firstId, secondId] = parts.map(Number);
  if ([companyId, bankAccountId, firstId, secondId].some(n => !Number.isSafeInteger(n)) || firstId === secondId) return null;
  return { companyId, bankAccountId, firstId, secondId };
}

/** One explicit company, rather than one particular transaction pair. */
function approvedCompany(env: Readonly<Record<string, string | undefined>>): CompanyApproval | null {
  if (env.GLOGGT_OWN_TRANSFER_PRODUCTION_APPROVAL !== COMPANY_APPROVAL) return null;
  const raw = env.GLOGGT_OWN_TRANSFER_PRODUCTION_SCOPE || '';
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const companyId = Number(raw);
  return Number.isSafeInteger(companyId) && companyId > 0 ? { mode: 'COMPANY', companyId } : null;
}

function verifiedProdUrl(raw: string | undefined, env: Readonly<Record<string, string | undefined>>): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.password ||
        !url.username || url.hash ||
        ['host', 'hostaddr', 'service', 'options', 'ssl', 'sslrootcert', 'sslcert', 'sslkey']
          .some(k => url.searchParams.has(k)) ||
        url.searchParams.getAll('sslmode').length > 1 ||
        !(url.searchParams.get('sslmode') === 'verify-full' ||
          (!url.searchParams.has('sslmode') && plausibleVerifiedCa(env))) ||
        decodeURIComponent(url.pathname.slice(1)) !== 'postgres') return false;
    const host = url.hostname.toLowerCase();
    const user = decodeURIComponent(url.username);
    const direct = host === `db.${PRODUCTION_REF}.supabase.co` && user === 'postgres' &&
      (url.port === '' || url.port === '5432');
    const pooler = SHARED_POOLER.test(host) && user === `postgres.${PRODUCTION_REF}` &&
      (url.port === '5432' || url.port === '6543');
    return direct || pooler;
  } catch { return false; }
}

/** The existing Prisma/pg adapter validates this same CA again at startup.
 * This check allows *policy review*, not proof of a successful TLS handshake.
 * A separate, verified Node -> endpoint connection is mandatory before writes.
 */
function plausibleVerifiedCa(env: Readonly<Record<string, string | undefined>>): boolean {
  const encoded = env.GLOGGT_PG_CA_PEM_B64;
  if (!encoded || encoded.length > 64_000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return false;
  try {
    const ca = Buffer.from(encoded, 'base64').toString('utf8');
    if (Buffer.from(ca).toString('base64') !== encoded ||
        !/^-----BEGIN CERTIFICATE-----\r?\n(?:[A-Za-z0-9+/=]+\r?\n)+-----END CERTIFICATE-----\r?\n?$/.test(ca)) return false;
    return new X509Certificate(ca).ca;
  } catch { return false; }
}

/** Explicit, fail-closed Production approval.
 * Legacy one-pair approval remains available and unchanged. A separate
 * company approval permits ANY human-reviewed pair of active bank accounts
 * in that same company, not a specific transaction ID.
 * Production server actions and DB transactions independently enforce
 * owner/admin access, operator attestation, status/amount/date, V3 claims,
 * TLS and auditability. This gate alone never proves account ownership.
 * General company approval is forbidden for local runs against Production.
 */
function approvedProdAccount(
  env: Readonly<Record<string, string | undefined>>,
  scope: OwnTransferAccountScope,
): Approval | CompanyApproval | null {
  const verifiedVercel = env.VERCEL_ENV === 'production' && env.VERCEL === '1';
  // The old isolated local acceptance route remains limited to an exact pair.
  const verifiedLocal = env.VERCEL_ENV === undefined && env.VERCEL === undefined &&
    env.NODE_ENV === 'development' &&
    env.GLOGGT_OWN_TRANSFER_LOCAL_PRODUCTION_APPROVAL === LOCAL_PRODUCTION_APPROVAL;
  if (!verifiedVercel && !verifiedLocal) return null;
  if (!verifiedProdUrl(env.DATABASE_URL, env) ||
      (env.DIRECT_URL !== undefined && !verifiedProdUrl(env.DIRECT_URL, env)) ||
      env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') !== `https://${PRODUCTION_REF}.supabase.co`) return null;
  if (!Number.isSafeInteger(scope.companyId) || scope.companyId <= 0 ||
      !Number.isSafeInteger(scope.bankAccountId) || scope.bankAccountId <= 0) return null;

  const pair = approvedPair(env);
  if (pair && scope.companyId === pair.companyId &&
      scope.bankAccountId === pair.bankAccountId) return pair;
  if (!verifiedVercel) return null; // no company-wide local Production writes

  const company = approvedCompany(env);
  return company && company.companyId === scope.companyId ? company : null;
}

/** Account view is enabled only after explicit, valid runtime approval. */
export function ownTransferAccountReady(
  env: Readonly<Record<string, string | undefined>> = process.env,
  scope?: OwnTransferAccountScope,
): boolean {
  if (env.GLOGGT_OWN_TRANSFER_CONFIRM_ENABLED !== 'true') return false;
  if (approvedIsolatedV03(env)) return true;
  const local = approvedIsolatedLocalFixture(env);
  if (local && scope?.companyId === local.companyId &&
      scope.bankAccountId === local.bankAccountId) return true;
  return !!scope && approvedProdAccount(env, scope) !== null;
}

/** Required on EVERY write path. Pair order may be reversed for a matching bank view. */
export function ownTransferScopedStorageEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
  scope?: OwnTransferScope,
): boolean {
  if (env.GLOGGT_OWN_TRANSFER_CONFIRM_ENABLED !== 'true') return false;
  if (approvedIsolatedV03(env)) return true;
  if (!scope) return false;
  const local = approvedIsolatedLocalFixture(env);
  if (local && scope.companyId === local.companyId &&
      scope.bankAccountId === local.bankAccountId) {
    return (scope.sourceId === local.firstId && scope.targetId === local.secondId) ||
      (scope.sourceId === local.secondId && scope.targetId === local.firstId);
  }
  const approved = approvedProdAccount(env, scope);
  if (!approved || !Number.isSafeInteger(scope.sourceId) || scope.sourceId <= 0 ||
      !Number.isSafeInteger(scope.targetId) || scope.targetId <= 0 ||
      scope.sourceId === scope.targetId) return false;
  if ('mode' in approved) return approved.mode === 'COMPANY';
  return (scope.sourceId === approved.firstId && scope.targetId === approved.secondId) ||
    (scope.sourceId === approved.secondId && scope.targetId === approved.firstId);
}
