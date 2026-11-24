import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { AppConfig } from './config.js';
import { toPublicConfig } from './config.js';
import type { Logger } from './logger.js';
import type { OriginValidator } from './security/origin.js';
import type { SessionManager } from './sessions/sessionManager.js';
import { PROTOCOL_VERSION } from '@shared/constants.js';

export interface AppDependencies {
  config: AppConfig;
  logger: Logger;
  sessions: SessionManager;
  originValidator: OriginValidator;
  /** Directory with the built client, if it exists. */
  clientDistDir?: string;
  startedAt?: number;
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function createApp(deps: AppDependencies): Express {
  const { config, logger, sessions, originValidator } = deps;
  const startedAt = deps.startedAt ?? Date.now();
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    if (config.env === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use((req, res, next) => {
    if (req.path.startsWith('/api') && req.headers.origin && !originValidator.isAllowed(req.headers.origin)) {
      res.status(403).json({ error: { code: 'UNAUTHORIZED', message: 'Origin not allowed' } });
      return;
    }
    next();
  });

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || originValidator.isAllowed(origin)) callback(null, true);
        else callback(null, false);
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '16kb' }));

  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      status: 'ok',
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      activeSessions: sessions.size,
      protocolVersion: PROTOCOL_VERSION,
      turnEnabled: toPublicConfig(config).turnEnabled,
      now: new Date().toISOString(),
    });
  });

  app.get('/api/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(toPublicConfig(config));
  });

  // General health route alias for cloud monitors and load balancers
  app.get('/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'ok', service: 'Drooit Signaling Server' });
  });

  app.use('/api', (req, res) => {
    res.status(404).json({
      error: { code: 'INVALID_INPUT', message: `Unknown API route: ${req.method} ${req.path}` },
    });
  });

  const clientDistDir = deps.clientDistDir ?? path.resolve(process.cwd(), 'dist/client');

  app.get('/', (req, res, next) => {
    const wantsJson =
      req.headers.accept?.includes('application/json') ||
      req.query.format === 'json' ||
      !existsSync(clientDistDir);

    if (wantsJson) {
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        service: 'Drooit Signaling Server',
        status: 'online',
        protocolVersion: PROTOCOL_VERSION,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        activeSessions: sessions.size,
        time: new Date().toISOString(),
      });
      return;
    }
    next();
  });

  if (existsSync(clientDistDir)) {
    app.use(
      express.static(clientDistDir, {
        index: false,
        etag: true,
        maxAge: '1y',
        immutable: true,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDistDir, 'index.html'), (error) => {
        if (error) next(error);
      });
    });
  } else if (config.env === 'production') {
    logger.warn('Client build not found; serving API and status only', { clientDistDir });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'INVALID_INPUT', message: 'Not found' } });
  });

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Unhandled HTTP error', { path: req.path, error: message });
    if (res.headersSent) return;
    res.status(500).json({
      error: { code: 'INTERNAL', message: 'Internal server error', retryable: true },
    });
  });

  return app;
}
