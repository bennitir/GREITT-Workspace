/**
 * Fail-closed, server-side gate for experimental family-transfer writes.
 * Production deployment is always read-only until an explicit code-reviewed release.
 * Localhost backed by the Production database is also always read-only.
 *
 * This is a deployment boundary, NOT a substitute for per-company auth / RLS.
 */
export function familySplitStorageEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (env.GLOGGT_FAMILY_SPLIT_STORAGE_ENABLED !== 'true' ||
      env.VERCEL_ENV === 'production') return false;

  const raw = env.DATABASE_URL;
  if (!raw) return false;
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username ||
      !url.password || url.hash ||
      url.searchParams.has('host') || url.searchParams.has('hostaddr') ||
      url.searchParams.has('service') || url.searchParams.has('options') ||
      url.searchParams.getAll('sslmode').length !== 1 ||
      !['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode') ?? '')) return false;

  let username: string;
  let database: string;
  try {
    username = decodeURIComponent(url.username);
    database = decodeURIComponent(url.pathname.slice(1));
  } catch { return false; }
  if (database !== 'postgres') return false;

  const ref = 'rfvuzcchsaamrykpdiqm'; // Dedicated Supabase integration TEST project.
  const host = url.hostname.toLowerCase();
  const direct = host === `db.${ref}.supabase.co` &&
    username === 'gloggt_preview_runtime' &&
    (url.port === '' || url.port === '5432');
  const pooler = host === 'aws-0-eu-west-1.pooler.supabase.com' &&
    username === `gloggt_preview_runtime.${ref}` &&
    (url.port === '5432' || url.port === '6543');
  if (!direct && !pooler) return false;

  // Prevent mixed Production credentials or Storage configuration in a test runtime.
  const allowedSupabaseUrl = `https://${ref}.supabase.co`;
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']) {
    const value = env[key]?.trim();
    if (value && value.replace(/\/$/, '') !== allowedSupabaseUrl) return false;
  }
  return true;
}
