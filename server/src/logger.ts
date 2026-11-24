type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACTED_KEYS = new Set([
  'token',
  'peerToken',
  'inviteToken',
  'credential',
  'password',
  'secret',
  'sdp',
  'authorization',
]);

export type LogFields = Record<string, unknown>;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth-limit]';
  if (Array.isArray(value)) return value.slice(0, 50).map((entry) => redact(entry, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACTED_KEYS.has(key) ? '[redacted]' : redact(entry, depth + 1);
    }
    return out;
  }
  return value;
}

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

export function createLogger(level: Level = 'info', base: LogFields = {}): Logger {
  const threshold = LEVELS[level];
  const emit = (entryLevel: Level, message: string, fields?: LogFields) => {
    if (LEVELS[entryLevel] < threshold) return;
    const record = {
      level: entryLevel,
      time: new Date().toISOString(),
      message,
      ...(redact(base) as LogFields),
      ...(fields ? (redact(fields) as LogFields) : {}),
    };
    const line = JSON.stringify(record);
    if (entryLevel === 'error') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  };
  return {
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
    child: (fields) => createLogger(level, { ...base, ...fields }),
  };
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};
