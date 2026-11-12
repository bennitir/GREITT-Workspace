import { Buffer } from "node:buffer";
import { hasVerifiedCaTlsConfigWithoutUrlMode, prismaPgConnectionOptions } from "./verified-database-tls";

const PREVIEW_PROJECT_REF = "rfvuzcchsaamrykpdiqm";
const PREVIEW_SUPABASE_URL = `https://${PREVIEW_PROJECT_REF}.supabase.co`;
const PREVIEW_DATABASE_HOST = `db.${PREVIEW_PROJECT_REF}.supabase.co`;
const PREVIEW_POOLER_HOST = "aws-0-eu-west-1.pooler.supabase.com";

const OPTIONAL_ANON_KEY_ENV_NAMES = [
  "SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const UNVERIFIABLE_KEY_ENV_NAMES = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
] as const;

const FORBIDDEN_PREVIEW_ENV_NAMES = [
  "OPENAI_API_KEY",
  "RESEND_API_KEY",
  "CRON_SECRET",
  "INSIGHT_WORKER_SECRET",
  "WEB_PUSH_VAPID_PUBLIC_KEY",
  "WEB_PUSH_VAPID_PRIVATE_KEY",
  "WEB_PUSH_VAPID_SUBJECT",
] as const;

type Environment = Readonly<Record<string, string | undefined>>;

function rejectPreviewConfiguration(reason: string): never {
  throw new Error(`Vercel Preview configuration rejected: ${reason}.`);
}

function requiredValue(
  env: Environment,
  name: string,
): string {
  const value = env[name]?.trim();
  if (!value) {
    rejectPreviewConfiguration(`${name} is required`);
  }
  return value;
}

function decodeUrlComponent(value: string, name: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return rejectPreviewConfiguration(`${name} is malformed`);
  }
}

function assertPreviewDatabaseUrl(
  value: string,
  name: string,
  env: Environment,
): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    rejectPreviewConfiguration(`${name} is malformed`);
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    rejectPreviewConfiguration(`${name} must use PostgreSQL`);
  }
  const username = decodeUrlComponent(url.username, name);
  if (
    username.length === 0 ||
    url.password.length === 0 ||
    decodeUrlComponent(url.pathname.slice(1), name) !== "postgres"
  ) {
    rejectPreviewConfiguration(`${name} does not identify the approved database`);
  }
  const modes = url.searchParams.getAll("sslmode");
  // 'require' and 'verify-ca' alone do not establish hostname validation.
  const explicitTls = modes.length === 1 && modes[0] === "verify-full";
  // Only the Prisma DATABASE_URL can use adapter-backed CA without URL sslmode.
  // DIRECT_URL is separate and must explicitly demand TLS.
  const caBackedTls = name === "DATABASE_URL" && modes.length === 0 &&
    hasVerifiedCaTlsConfigWithoutUrlMode(env);
  if (!explicitTls && !caBackedTls) {
    rejectPreviewConfiguration(`${name} must require TLS`);
  }
  if (url.hash || ["host", "hostaddr", "ssl", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat", "service", "options"].some(
    parameter => url.searchParams.has(parameter)
  )) {
    rejectPreviewConfiguration(`${name} contains an unsupported connection override`);
  }
  if (name === "DATABASE_URL" && env.GLOGGT_PG_CA_PEM_B64 !== undefined) {
    try {
      prismaPgConnectionOptions(env);
    } catch {
      rejectPreviewConfiguration("DATABASE_URL CA-backed TLS configuration is invalid");
    }
  }
  const hostname = url.hostname.toLowerCase();
  const validDirectConnection =
    hostname === PREVIEW_DATABASE_HOST &&
    (url.port === "" || url.port === "5432");
  const validPoolerConnection =
    hostname === PREVIEW_POOLER_HOST &&
    username.endsWith(`.${PREVIEW_PROJECT_REF}`) &&
    username.length > PREVIEW_PROJECT_REF.length + 1 &&
    ["5432", "6543"].includes(url.port);

  if (!validDirectConnection && !validPoolerConnection) {
    rejectPreviewConfiguration(`${name} must point to the approved Supabase project`);
  }
}

function readJwtClaims(value: string): Record<string, unknown> | null {
  const parts = value.split(".");
  if (parts.length !== 3 || !parts[1]) {
    return null;
  }

  try {
    const claims: unknown = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    if (typeof claims !== "object" || claims === null || Array.isArray(claims)) {
      return null;
    }
    return claims as Record<string, unknown>;
  } catch {
    return null;
  }
}

function assertPreviewJwtKey(
  value: string,
  name: string,
  expectedRole: "anon" | "service_role",
): void {
  const claims = readJwtClaims(value);
  if (claims?.ref !== PREVIEW_PROJECT_REF || claims.role !== expectedRole) {
    rejectPreviewConfiguration(`${name} is not an authorized key for the approved project`);
  }
}

function assertPreviewSupabaseUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    rejectPreviewConfiguration("NEXT_PUBLIC_SUPABASE_URL is malformed");
  }

  if (
    url.protocol !== "https:" ||
    url.origin !== PREVIEW_SUPABASE_URL ||
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    rejectPreviewConfiguration(
      "NEXT_PUBLIC_SUPABASE_URL must identify the approved project over HTTPS",
    );
  }
}

export function assertSafeVercelPreviewEnvironment(
  env: Environment = process.env,
): void {
  if (env.VERCEL_ENV === "production") {
    return;
  }

  if (env.VERCEL_ENV !== "preview") {
    if (env.VERCEL === "1" || env.VERCEL_URL) {
      rejectPreviewConfiguration("VERCEL_ENV must explicitly identify Preview");
    }
    return;
  }

  // This small TLS release does not contain the RLS-only session/context and
  // Storage disabling from main. Do not silently enable an incomplete mode.
  if (env.GLOGGT_PREVIEW_RLS_ENABLED !== undefined) {
    rejectPreviewConfiguration("GLOGGT_PREVIEW_RLS_ENABLED is unsupported in this release");
  }
  assertPreviewDatabaseUrl(requiredValue(env, "DATABASE_URL"), "DATABASE_URL", env);
  const directUrl = env.DIRECT_URL?.trim();
  if (directUrl) assertPreviewDatabaseUrl(directUrl, "DIRECT_URL", env);

  assertPreviewSupabaseUrl(requiredValue(env, "NEXT_PUBLIC_SUPABASE_URL"));
  assertPreviewJwtKey(
    requiredValue(env, "SUPABASE_SERVICE_ROLE_KEY"),
    "SUPABASE_SERVICE_ROLE_KEY",
    "service_role",
  );
  for (const name of OPTIONAL_ANON_KEY_ENV_NAMES) {
    const value = env[name]?.trim();
    if (value) assertPreviewJwtKey(value, name, "anon");
  }
  for (const name of UNVERIFIABLE_KEY_ENV_NAMES) {
    if (env[name]?.trim()) {
      rejectPreviewConfiguration(`${name} is not permitted in Preview`);
    }
  }

  for (const name of FORBIDDEN_PREVIEW_ENV_NAMES) {
    if (env[name]?.trim()) {
      rejectPreviewConfiguration(`${name} is not permitted in Preview`);
    }
  }
}
