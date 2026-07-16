import 'dotenv/config';
import { z } from 'zod';

const booleanString = (defaultValue: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(defaultValue)
    .transform((value) => value === 'true');
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DEPLOYMENT_MODE: z.enum(['local', 'server']).default('local'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1024).max(65535).default(4317),
  PUBLIC_BASE_URL: z.string().url().default('http://127.0.0.1:4317'),
  DATABASE_URL: z.string().min(1).default('file:./data/meetwise.db'),
  DATABASE_BUSY_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
  SESSION_SECRET: z.string().min(32).default('development-only-session-secret-change-me'),
  TOKEN_SIGNING_SECRET: z
    .string()
    .min(32)
    .default('development-only-token-signing-secret-change-me'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
  EXTENSION_ACCESS_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  EXTENSION_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  CORS_ALLOWED_ORIGINS: z.string().default(''),
  TRUST_PROXY: z.string().default('false'),
  OLLAMA_URL: z.string().url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().trim().min(1).max(120).default('llama3.2'),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(120_000),
  OLLAMA_HEALTH_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(2_500),
  OLLAMA_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  OLLAMA_MAX_TRANSCRIPT_CHARS: z.coerce.number().int().min(1_000).max(2_000_000).default(300_000),
  ANALYSIS_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  ANALYSIS_JOB_LOCK_TIMEOUT_MS: z.coerce.number().int().min(60_000).max(3_600_000).default(300_000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MAX_JSON_BODY: z
    .string()
    .regex(/^\d+(kb|mb)$/i)
    .default('5mb')
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(
    `Invalid Meetwise configuration:\n${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')}`
  );
}

const env = parsed.data;

function normalizeDatabaseUrl(input: string): string {
  if (!input.startsWith('file:')) throw new Error('DATABASE_URL must use a local file: URL');
  const value = input.slice(5);
  if (!value || value === ':memory:') {
    if (env.NODE_ENV !== 'test') throw new Error('DATABASE_URL must point to a persistent file');
    return input;
  }
  if (value.includes('?') || value.includes('#'))
    throw new Error('DATABASE_URL must not contain a query or fragment');
  return input;
}

function normalizeServiceUrl(input: string, label: string): string {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error(`${label} must use http or https`);
  if (url.username || url.password) throw new Error(`${label} must not contain credentials`);
  if (url.search || url.hash) throw new Error(`${label} must not contain a query or fragment`);
  if (url.pathname !== '/' && url.pathname !== '')
    throw new Error(`${label} must not contain a path`);
  return url.origin;
}

function parseTrustProxy(value: string): false | number | string {
  if (value === 'false' || value === '') return false;
  if (/^\d+$/.test(value)) return Number(value);
  if (value === 'true')
    throw new Error('TRUST_PROXY=true is too broad; use a hop count or trusted subnet');
  return value;
}

const publicBaseUrl = normalizeServiceUrl(env.PUBLIC_BASE_URL, 'PUBLIC_BASE_URL');
const ollamaUrl = normalizeServiceUrl(env.OLLAMA_URL, 'OLLAMA_URL');
const databaseUrl = normalizeDatabaseUrl(env.DATABASE_URL);
const corsAllowedOrigins = env.CORS_ALLOWED_ORIGINS.split(',')
  .map((v) => v.trim())
  .filter(Boolean);

if (corsAllowedOrigins.some((origin) => origin === '*' || origin.includes('*'))) {
  throw new Error('CORS_ALLOWED_ORIGINS must not contain wildcards');
}

if (env.NODE_ENV === 'production' && env.DEPLOYMENT_MODE !== 'server') {
  throw new Error('Production requires DEPLOYMENT_MODE=server');
}
if (env.ANALYSIS_JOB_LOCK_TIMEOUT_MS <= env.OLLAMA_TIMEOUT_MS) {
  throw new Error('ANALYSIS_JOB_LOCK_TIMEOUT_MS must exceed OLLAMA_TIMEOUT_MS');
}
if (env.DEPLOYMENT_MODE === 'server') {
  if (!publicBaseUrl.startsWith('https://'))
    throw new Error('Server mode requires an HTTPS PUBLIC_BASE_URL');
  for (const [name, secret] of [
    ['SESSION_SECRET', env.SESSION_SECRET],
    ['TOKEN_SIGNING_SECRET', env.TOKEN_SIGNING_SECRET]
  ] as const) {
    if (secret.length < 48 || secret.includes('development-only') || secret.includes('change-me')) {
      throw new Error(
        `${name} must be a unique random value of at least 48 characters in server mode`
      );
    }
  }
  if (env.HOST === '127.0.0.1' || env.HOST === 'localhost') {
    throw new Error('Server mode must bind to a non-loopback HOST (normally 0.0.0.0)');
  }
}

export const config = Object.freeze({
  nodeEnv: env.NODE_ENV,
  deploymentMode: env.DEPLOYMENT_MODE,
  host: env.HOST,
  port: env.PORT,
  publicBaseUrl,
  databaseUrl,
  databaseBusyTimeoutMs: env.DATABASE_BUSY_TIMEOUT_MS,
  sessionSecret: env.SESSION_SECRET,
  tokenSigningSecret: env.TOKEN_SIGNING_SECRET,
  sessionTtlHours: env.SESSION_TTL_HOURS,
  extensionAccessTtlMinutes: env.EXTENSION_ACCESS_TTL_MINUTES,
  extensionRefreshTtlDays: env.EXTENSION_REFRESH_TTL_DAYS,
  corsAllowedOrigins,
  trustProxy: parseTrustProxy(env.TRUST_PROXY),
  ollamaUrl,
  ollamaModel: env.OLLAMA_MODEL,
  ollamaTimeoutMs: env.OLLAMA_TIMEOUT_MS,
  ollamaHealthTimeoutMs: env.OLLAMA_HEALTH_TIMEOUT_MS,
  ollamaMaxConcurrency: env.OLLAMA_MAX_CONCURRENCY,
  ollamaMaxTranscriptChars: env.OLLAMA_MAX_TRANSCRIPT_CHARS,
  analysisMaxAttempts: env.ANALYSIS_MAX_ATTEMPTS,
  analysisJobLockTimeoutMs: env.ANALYSIS_JOB_LOCK_TIMEOUT_MS,
  logLevel: env.LOG_LEVEL,
  maxJsonBody: env.MAX_JSON_BODY,
  secureCookies: env.DEPLOYMENT_MODE === 'server'
});

export type Config = typeof config;
