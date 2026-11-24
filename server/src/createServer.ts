import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import type { Express } from 'express';
import { loadConfig, type AppConfig } from './config.js';
import { createLogger, type Logger } from './logger.js';
import { createOriginValidator, type OriginValidator } from './security/origin.js';
import type { RateLimiterLike } from './security/rateLimiter.js';
import { SessionManager } from './sessions/sessionManager.js';
import { PairingService } from './sessions/pairingService.js';
import { SignalingService } from './signaling/signalingService.js';
import { createApp } from './app.js';

export interface DrooitServerOptions {
  config?: AppConfig;
  logger?: Logger;
  clientDistDir?: string;
  sessionTtlMs?: number;
  maxSessions?: number;
  now?: () => number;
  createRateLimiter?: (options: { limit: number; windowMs: number }) => RateLimiterLike;
}

export interface DrooitServer {
  app: Express;
  httpServer: HttpServer;
  io: SocketServer;
  sessions: SessionManager;
  pairing: PairingService;
  signaling: SignalingService;
  config: AppConfig;
  logger: Logger;
  originValidator: OriginValidator;
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

/**
 * Composes the HTTP app, Socket.IO signaling and session services. Used by both
 * `index.ts` and the automated tests so the tested wiring is the shipped wiring.
 */
export function createDrooitServer(options: DrooitServerOptions = {}): DrooitServer {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? createLogger(config.logLevel);
  const originValidator = createOriginValidator(config.allowedOrigins, {
    isProduction: config.env === 'production',
  });

  let signaling: SignalingService | undefined;

  const sessions = new SessionManager({
    ttlMs: options.sessionTtlMs ?? config.sessionTtlMs,
    maxSessions: options.maxSessions ?? config.maxSessions,
    now: options.now,
    onEnded: (event) => signaling?.handleEnded(event),
  });
  const pairing = new PairingService(sessions);

  const app = createApp({
    config,
    logger,
    sessions,
    originValidator,
    clientDistDir: options.clientDistDir,
  });

  const httpServer = createHttpServer(app);
  const io = new SocketServer(httpServer, {
    serveClient: false,
    perMessageDeflate: false,
    maxHttpBufferSize: 1024 * 1024,
    pingInterval: 20_000,
    pingTimeout: 20_000,
    transports: ['websocket', 'polling'],
    cors: {
      origin: (origin, callback) => {
        if (originValidator.isAllowed(origin)) callback(null, true);
        else callback(new Error('Origin not allowed'));
      },
      methods: ['GET', 'POST'],
      credentials: false,
      maxAge: 600,
    },
    allowRequest: (req, callback) => {
      callback(null, originValidator.isAllowed(req.headers.origin));
    },
  });

  signaling = new SignalingService({
    io,
    sessions,
    pairing,
    config,
    logger,
    originValidator,
    createRateLimiter: options.createRateLimiter,
  });
  signaling.start();

  const listen = (port = config.port, host = '0.0.0.0'): Promise<number> =>
    new Promise((resolve, reject) => {
      const onError = (error: Error) => {
        httpServer.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        httpServer.off('error', onError);
        const address = httpServer.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Unexpected server address'));
          return;
        }
        resolve(address.port);
      };
      httpServer.once('error', onError);
      httpServer.once('listening', onListening);
      httpServer.listen(port, host);
    });

  const close = async (): Promise<void> => {
    signaling?.stop();
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
    if (httpServer.listening) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
    sessions.destroyAll();
  };

  return {
    app,
    httpServer,
    io,
    sessions,
    pairing,
    signaling,
    config,
    logger,
    originValidator,
    listen,
    close,
  };
}
