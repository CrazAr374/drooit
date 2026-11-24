import 'dotenv/config';
import { createHmac } from 'node:crypto';
import { z } from 'zod';
import type { IceServerConfig, PublicConfig } from '@shared/types.js';
import {
  DEFAULT_CHUNK_SIZE,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_SESSION,
  MAX_SESSION_BYTES,
  PROTOCOL_VERSION,
  SESSION_TTL_MS,
} from '@shared/constants.js';

const csv = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  PUBLIC_URL: z.string().url().optional(),
  TRUST_PROXY: z
    .string()
    .default('false')
    .transform((value) => value === 'true' || value === '1'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  STUN_URLS: z
    .string()
    .default('stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302'),
  TURN_URLS: z.string().default(''),
  TURN_SECRET: z.string().default(''),
  TURN_USERNAME: z.string().default(''),
  TURN_PASSWORD: z.string().default(''),
  TURN_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3600),
  SESSION_TTL_MS: z.coerce.number().int().min(10_000).default(SESSION_TTL_MS),
  MAX_SESSIONS: z.coerce.number().int().min(1).default(5000),
});

export type AppConfig = {
  env: 'development' | 'test' | 'production';
  port: number;
  allowedOrigins: string[];
  publicUrl?: string;
  trustProxy: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  stunUrls: string[];
  turnUrls: string[];
  turnSecret: string;
  turnUsername: string;
  turnPassword: string;
  turnTtlSeconds: number;
  sessionTtlMs: number;
  maxSessions: number;
};

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  const env = parsed.data;
  const allowedOrigins = csv(env.CLIENT_ORIGIN).map((origin) => origin.replace(/\/$/, ''));
  if (allowedOrigins.length === 0) {
    throw new Error('CLIENT_ORIGIN must contain at least one origin');
  }
  if (env.NODE_ENV === 'production' && allowedOrigins.includes('*')) {
    throw new Error('CLIENT_ORIGIN cannot be "*" in production');
  }
  if (env.NODE_ENV === 'production' && allowedOrigins.some((origin) => origin.startsWith('http://'))) {
    // Local development over http is fine; production must serve over https.
    // A reverse proxy may terminate TLS, so we warn rather than fail.
    // eslint-disable-next-line no-console
    console.warn('[config] CLIENT_ORIGIN contains a non-TLS origin in production');
  }

  return {
    env: env.NODE_ENV,
    port: env.PORT,
    allowedOrigins,
    publicUrl: env.PUBLIC_URL,
    trustProxy: env.TRUST_PROXY,
    logLevel: env.LOG_LEVEL,
    stunUrls: csv(env.STUN_URLS),
    turnUrls: csv(env.TURN_URLS),
    turnSecret: env.TURN_SECRET,
    turnUsername: env.TURN_USERNAME,
    turnPassword: env.TURN_PASSWORD,
    turnTtlSeconds: env.TURN_TTL_SECONDS,
    sessionTtlMs: env.SESSION_TTL_MS,
    maxSessions: env.MAX_SESSIONS,
  };
}

/**
 * coturn REST API credentials: `username` embeds the expiry, and the credential is
 * an HMAC over that username using the shared static-auth-secret. Credentials are
 * therefore time-limited and never stored on the client.
 */
export function buildIceServers(
  config: Pick<AppConfig, 'stunUrls' | 'turnUrls' | 'turnSecret' | 'turnUsername' | 'turnPassword' | 'turnTtlSeconds'>,
  now = Date.now(),
): { iceServers: IceServerConfig[]; turnEnabled: boolean } {
  const iceServers: IceServerConfig[] = [];
  if (config.stunUrls.length > 0) {
    iceServers.push({ urls: config.stunUrls });
  }

  if (config.turnUrls.length > 0) {
    if (config.turnSecret) {
      const expiry = Math.floor(now / 1000) + config.turnTtlSeconds;
      const username = `${expiry}:drooit`;
      const credential = createHmac('sha1', config.turnSecret).update(username).digest('base64');
      iceServers.push({ urls: config.turnUrls, username, credential });
    } else if (config.turnUsername && config.turnPassword) {
      iceServers.push({
        urls: config.turnUrls,
        username: config.turnUsername,
        credential: config.turnPassword,
      });
    }
  }

  const turnEnabled =
    config.turnUrls.length > 0 && (Boolean(config.turnSecret) || Boolean(config.turnUsername && config.turnPassword));

  return { iceServers, turnEnabled };
}

export function toPublicConfig(config: AppConfig, now = Date.now()): PublicConfig {
  const { iceServers, turnEnabled } = buildIceServers(config, now);
  return {
    protocolVersion: PROTOCOL_VERSION,
    iceServers,
    turnEnabled,
    limits: {
      maxFiles: MAX_FILES_PER_SESSION,
      maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
      maxSessionBytes: MAX_SESSION_BYTES,
      chunkSize: DEFAULT_CHUNK_SIZE,
    },
    sessionTtlMs: config.sessionTtlMs,
  };
}
