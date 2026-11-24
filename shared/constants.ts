/**
 * Wire protocol shared by the browser clients and the signaling server.
 * Everything here is transport-agnostic so it can be unit tested in Node.
 */

export const PROTOCOL_VERSION = 1;

export const SESSION_CODE_DIGITS = 6;
export const SESSION_TTL_MS = 10 * 60 * 1000;
export const SESSION_CONNECTED_TTL_MS = 60 * 60 * 1000;
export const SESSION_ABSOLUTE_TTL_MS = 6 * 60 * 60 * 1000;
export const SESSION_SWEEP_INTERVAL_MS = 15_000;

export const DEFAULT_CHUNK_SIZE = 256 * 1024;
export const MIN_CHUNK_SIZE = 16 * 1024;
export const MAX_CHUNK_SIZE = 1024 * 1024;

/** Stop handing chunks to the data channel above this buffered amount. */
export const BUFFER_HIGH_WATER = 4 * 1024 * 1024;
/** Resume sending once the channel drains back to this level. */
export const BUFFER_LOW_WATER = 1024 * 1024;

export const MAX_FILES_PER_SESSION = 200;
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 * 1024;
export const MAX_SESSION_BYTES = 100 * 1024 * 1024 * 1024;

export const DATA_CHANNEL_LABEL = 'drooit-data';
export const CONTROL_CHANNEL_LABEL = 'drooit-control';

export const SESSION_CREATE_RATE = { limit: 8, windowMs: 60_000 } as const;
export const SESSION_JOIN_RATE = { limit: 12, windowMs: 60_000 } as const;
export const SIGNAL_RATE = { limit: 400, windowMs: 10_000 } as const;

export const MAX_JOIN_ATTEMPTS_PER_CODE = 25;
