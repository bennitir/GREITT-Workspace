/**
 * Optional, fail-closed CA pinning for the Prisma/pg adapter.
 *
 * DATABASE_URL remains unchanged in process.env. In particular, the document-set
 * Production guard accepts either approved URL sslmode or an explicitly verified
 * CA-backed adapter configuration when URL sslmode is absent.
 *
 * pg-connection-string replaces an explicit `ssl` object when the supplied URL
 * contains `sslmode`/`sslrootcert`/`sslcert`/`sslkey`. We therefore strip ONLY
 * sslmode from the adapter-local copy when an explicit trusted CA is supplied.
 * This module must never log a URL, credential or certificate.
 */
import { X509Certificate } from 'node:crypto';

type Environment = Readonly<Record<string, string | undefined>>;

type VerifiedPgConfiguration = {
  connectionString: string;
  ssl?: { ca: string; rejectUnauthorized: true; servername: string };
};

const DISALLOWED_URL_PARAMETERS = [
  'ssl', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat',
  'host', 'hostaddr', 'service', 'options',
] as const;

function verifiedCaFromBase64(encoded: string): string {
  if (!encoded || encoded.length > 64_000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error('GLOGGT_PG_TLS_CA_INVALID');
  }
  const ca = Buffer.from(encoded, 'base64').toString('utf8');
  if (Buffer.from(ca, 'utf8').toString('base64') !== encoded ||
      !/^-----BEGIN CERTIFICATE-----\r?\n(?:[A-Za-z0-9+/=]+\r?\n)+-----END CERTIFICATE-----\r?\n?$/.test(ca)) {
    throw new Error('GLOGGT_PG_TLS_CA_INVALID');
  }
  try {
    if (!new X509Certificate(ca).ca) {
      throw new Error('Not a CA');
    }
  } catch {
    throw new Error('GLOGGT_PG_TLS_CA_INVALID');
  }
  return ca;
}

/**
 * Existing deployments are unchanged until GLOGGT_PG_CA_PEM_B64 is explicitly
 * configured. Never introduce this setting without also verifying the actual
 * certificate chain and hostname of the DEPLOYED connection endpoint.
 */
export function prismaPgConnectionOptions(env: Environment = process.env): VerifiedPgConfiguration {
  const raw = env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL vantar.');

  // Retain the previous working PrismaPg behavior for any environment that has
  // not explicitly opted in to CA pinning. This does NOT grant write permission.
  if (env.GLOGGT_PG_CA_PEM_B64 === undefined) return { connectionString: raw };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('GLOGGT_PG_TLS_URL_INVALID');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname || !url.username || !url.password || !url.pathname || url.hash ||
      DISALLOWED_URL_PARAMETERS.some(parameter => url.searchParams.has(parameter)) ||
      url.searchParams.getAll('sslmode').length > 1 ||
      (url.searchParams.has('sslmode') && url.searchParams.get('sslmode') !== 'verify-full')) {
    throw new Error('GLOGGT_PG_TLS_URL_INVALID');
  }

  const ca = verifiedCaFromBase64(env.GLOGGT_PG_CA_PEM_B64);
  const servername = url.hostname;
  // Keep the ORIGINAL process.env.DATABASE_URL intact for independent policy checks.
  // Only the private copy passed to pg has sslmode removed, so the CA object
  // cannot be overwritten by the connection-string parser.
  url.searchParams.delete('sslmode');
  return {
    connectionString: url.toString(),
    ssl: { ca, rejectUnauthorized: true, servername },
  };
}

/**
 * Safe policy alternative only for URLs without an sslmode parameter.
 * This proves the adapter is configured to demand CA + hostname validation;
 * the TLS handshake itself must still succeed or no database operation runs.
 */
export function hasVerifiedCaTlsConfigWithoutUrlMode(env: Environment = process.env): boolean {
  if (env.GLOGGT_PG_CA_PEM_B64 === undefined) return false;
  try {
    const source = new URL(env.DATABASE_URL ?? '');
    if (source.searchParams.has('sslmode')) return false;
    const config = prismaPgConnectionOptions(env);
    return config.ssl?.rejectUnauthorized === true &&
      config.ssl.servername === source.hostname &&
      !new URL(config.connectionString).searchParams.has('sslmode');
  } catch {
    return false;
  }
}
