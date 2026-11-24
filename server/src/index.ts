import { loadConfig, toPublicConfig } from './config.js';
import { createLogger } from './logger.js';
import { createDrooitServer } from './createServer.js';

const config = loadConfig();
const logger = createLogger(config.logLevel);
const server = createDrooitServer({ config, logger });

const port = await server.listen();

logger.info('Drooit signaling server listening', {
  port,
  env: config.env,
  publicUrl: config.publicUrl ?? null,
  allowedOrigins: config.allowedOrigins,
  turnEnabled: toPublicConfig(config).turnEnabled,
});

let shuttingDown = false;
const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info('Shutting down', { signal });
  try {
    await server.close();
    process.exit(0);
  } catch (error) {
    logger.error('Shutdown failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  void shutdown('uncaughtException');
});
