/** Fail closed. This experimental journal may NEVER write through the remote
 * Supabase/Production URL used by the ordinary localhost app. The check is
 * a SECOND guard after authentication, database permissions and RLS.
 */
export const LOCAL_FAMILY_DATABASE = 'gloggt_v03_reconciliation_test_20261031';
export function familyLoanJournalLocalEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (env.GLOGGT_FAMILY_LOAN_LOCAL_JOURNAL !== 'V03_LOCAL_ONLY' ||
      env.VERCEL || env.VERCEL_ENV || env.NODE_ENV === 'production') return false;
  if (!env.DATABASE_URL) return false;
  try {
    const url = new URL(env.DATABASE_URL);
    if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') return false;
    if (!['127.0.0.1', 'localhost'].includes(url.hostname.toLowerCase()) ||
        url.port !== '55432' || url.pathname !== `/${LOCAL_FAMILY_DATABASE}` ||
        decodeURIComponent(url.username) !== 'v03_reconciliation_runtime_20261031' ||
        !url.password || url.hash || url.searchParams.has('host') ||
        url.searchParams.has('hostaddr') || url.searchParams.has('service') ||
        url.searchParams.has('options')) return false;
    return true;
  } catch {
    return false;
  }
}
