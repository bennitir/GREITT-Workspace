import 'server-only';

import type { Prisma } from '@/app/generated/prisma/client';
import { Client } from 'pg';
import { prismaPgConnectionOptions } from '@/lib/core/verified-database-tls';

/**
 * Use the same strict, CA-backed pg options as GLÖGGT's Prisma adapter.
 * A Supabase pooler can have a fully validated TLS connection from Node while
 * its separate pooler -> PostgreSQL backend connection reports pg_stat_ssl=false.
 * Never infer the TLS state of the app -> pooler link from pg_stat_ssl.
 * No writes, no downgrade to rejectUnauthorized:false and no secret logging.
 *
 * NB: This does not attest to encryption on the pooler -> database hop.
 */
export async function assertVerifiedDocumentSetTls(
  tx: Prisma.TransactionClient,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (env.VERCEL_ENV !== 'production') return;
  let source: URL;
  try {
    source = new URL(env.DATABASE_URL ?? '');
    if (!['postgres:', 'postgresql:'].includes(source.protocol)) throw Error('PROTOCOL');
  } catch {
    throw new Error('PRODUCTION_DATABASE_TLS_UNVERIFIED');
  }
  const pooler = /^aws-\d+-[a-z]{2}-[a-z]+-\d+\.pooler\.supabase\.com$/i.test(source.hostname);
  let client: Client | null = null;
  try {
    const configuration = prismaPgConnectionOptions(env);
    client = new Client({
      ...configuration,
      connectionTimeoutMillis: 8000,
      query_timeout: 8000,
      options: '-c default_transaction_read_only=on',
      application_name: 'gloggt-document-set-tls-attestation',
    });
    await client.connect();
    const socket = (client as Client & {
      connection?: { stream?: { encrypted?: boolean; authorized?: boolean } };
    }).connection?.stream;
    if (socket?.encrypted !== true || socket?.authorized !== true) {
      throw new Error('TLS_NOT_AUTHORIZED');
    }
    if (!pooler) {
      // This backend check is relevant for direct PG connections only.
      const rows = await tx.$queryRaw<Array<{ ssl: boolean }>>`
        SELECT ssl FROM pg_catalog.pg_stat_ssl WHERE pid = pg_catalog.pg_backend_pid()
      `;
      if (rows.length !== 1 || rows[0]?.ssl !== true) throw new Error('BACKEND_TLS_FALSE');
    }
  } catch {
    throw new Error('PRODUCTION_DATABASE_TLS_UNVERIFIED');
  } finally {
    if (client) await client.end().catch(() => undefined);
  }
}
