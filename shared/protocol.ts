import { z } from 'zod';
import { MAX_CHUNK_SIZE, MAX_FILE_SIZE_BYTES, MAX_FILES_PER_SESSION, PROTOCOL_VERSION } from './constants.js';
import type { SharedFileMeta } from './types.js';
export type { SharedFileMeta };

/* -------------------------------------------------------------------------- */
/* Binary chunk framing                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Frame layout (little-endian):
 *   uint16 fileIndex | uint16 flags | uint32 chunkIndex | uint32 payloadLength
 * followed by `payloadLength` bytes of file data. The fixed 12-byte header keeps
 * every data-channel message self-describing, which makes resume and integrity
 * handling straightforward.
 */
export const CHUNK_HEADER_BYTES = 12;
export const CHUNK_FLAG_NONE = 0;

export function encodeChunkFrame(fileIndex: number, chunkIndex: number, payload: Uint8Array): ArrayBuffer {
  if (!Number.isInteger(fileIndex) || fileIndex < 0 || fileIndex > 0xffff) {
    throw new RangeError(`fileIndex out of range: ${fileIndex}`);
  }
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    throw new RangeError(`chunkIndex out of range: ${chunkIndex}`);
  }
  if (payload.byteLength > MAX_CHUNK_SIZE) {
    throw new RangeError(`chunk too large: ${payload.byteLength}`);
  }
  const buffer = new ArrayBuffer(CHUNK_HEADER_BYTES + payload.byteLength);
  const view = new DataView(buffer);
  view.setUint16(0, fileIndex, true);
  view.setUint16(2, CHUNK_FLAG_NONE, true);
  view.setUint32(4, chunkIndex, true);
  view.setUint32(8, payload.byteLength, true);
  new Uint8Array(buffer, CHUNK_HEADER_BYTES).set(payload);
  return buffer;
}

export interface DecodedChunk {
  fileIndex: number;
  flags: number;
  chunkIndex: number;
  payload: Uint8Array;
}

export function decodeChunkFrame(buffer: ArrayBuffer): DecodedChunk {
  if (buffer.byteLength < CHUNK_HEADER_BYTES) {
    throw new RangeError('Chunk frame shorter than header');
  }
  const view = new DataView(buffer);
  const payloadLength = view.getUint32(8, true);
  if (payloadLength > buffer.byteLength - CHUNK_HEADER_BYTES) {
    throw new RangeError('Chunk frame payload length exceeds message size');
  }
  const payload = new Uint8Array(buffer, CHUNK_HEADER_BYTES, payloadLength);
  return {
    fileIndex: view.getUint16(0, true),
    flags: view.getUint16(2, true),
    chunkIndex: view.getUint32(4, true),
    payload,
  };
}

/* -------------------------------------------------------------------------- */
/* Control channel messages                                                    */
/* -------------------------------------------------------------------------- */

const deviceSchema = z.object({
  name: z.string().min(1).max(80),
  platform: z.string().min(1).max(40),
  browser: z.string().min(1).max(40),
});

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const fileMetaSchema = z.object({
  index: z.number().int().min(0).max(0xffff),
  name: z.string().min(1).max(512),
  relativePath: z.string().min(1).max(1024),
  size: z.number().int().min(0).max(MAX_FILE_SIZE_BYTES),
  mime: z.string().max(255),
  lastModified: z.number().int().min(0),
});

const peerErrorSchema = z.object({
  code: z.string().min(1).max(48),
  message: z.string().min(1).max(500),
});

export const controlMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hello'),
    protocolVersion: z.number().int().min(1).max(1000),
    sender: deviceSchema,
    fileCount: z.number().int().min(0).max(MAX_FILES_PER_SESSION),
    totalBytes: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('meta'),
    files: z.array(fileMetaSchema).min(1).max(MAX_FILES_PER_SESSION),
  }),
  z.object({
    type: z.literal('accept'),
    fileIndexes: z.array(z.number().int().min(0).max(0xffff)).min(1).max(MAX_FILES_PER_SESSION),
  }),
  z.object({
    type: z.literal('reject'),
    reason: z.string().max(300).optional(),
  }),
  z.object({ type: z.literal('start') }),
  z.object({
    type: z.literal('file-end'),
    fileIndex: z.number().int().min(0).max(0xffff),
    sha256: sha256Schema,
    size: z.number().int().min(0).max(MAX_FILE_SIZE_BYTES),
  }),
  z.object({
    type: z.literal('file-verified'),
    fileIndex: z.number().int().min(0).max(0xffff),
    ok: z.boolean(),
    error: z.string().max(300).optional(),
  }),
  z.object({
    type: z.literal('progress'),
    fileIndex: z.number().int().min(0).max(0xffff),
    receivedBytes: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('pause'),
    reason: z.string().max(300).optional(),
  }),
  z.object({ type: z.literal('resume') }),
  z.object({ type: z.literal('restart') }),
  z.object({
    type: z.literal('cancel'),
    reason: z.string().max(300).optional(),
  }),
  z.object({
    type: z.literal('done'),
    ok: z.boolean(),
    totalBytes: z.number().int().min(0),
    fileCount: z.number().int().min(0).max(MAX_FILES_PER_SESSION),
  }),
  z.object({ type: z.literal('request-state') }),
  z.object({
    type: z.literal('resume-state'),
    files: z
      .array(
        z.object({
          fileIndex: z.number().int().min(0).max(0xffff),
          receivedBytes: z.number().int().min(0),
          complete: z.boolean(),
          sha256: sha256Schema.optional(),
        }),
      )
      .max(MAX_FILES_PER_SESSION),
  }),
  z.object({
    type: z.literal('error'),
    code: z.string().min(1).max(48),
    message: z.string().min(1).max(500),
  }),
  z.object({
    type: z.literal('file-begin'),
    fileIndex: z.number().int().min(0).max(0xffff),
    startByte: z.number().int().min(0),
    chunkSize: z.number().int().min(1).max(MAX_CHUNK_SIZE),
  }),
  z.object({
    type: z.literal('ping'),
    t: z.number().min(0),
  }),
  z.object({
    type: z.literal('pong'),
    t: z.number().min(0),
  }),
  z.object({
    type: z.literal('chat:message'),
    id: z.string().min(1).max(64),
    senderPeerId: z.string().min(1).max(64),
    senderName: z.string().min(1).max(80),
    timestamp: z.number().min(0),
    content: z.string().max(10_000),
    folderRef: z.string().max(1024).optional(),
    files: z.array(fileMetaSchema).max(MAX_FILES_PER_SESSION).optional(),
    audioPayloadBase64: z.string().max(10_000_000).optional(),
    durationSeconds: z.number().min(0).max(600).optional(),
  }),
  z.object({
    type: z.literal('chat:voice'),
    id: z.string().min(1).max(64),
    senderPeerId: z.string().min(1).max(64),
    senderName: z.string().min(1).max(80),
    timestamp: z.number().min(0),
    durationSeconds: z.number().min(0).max(600),
    mime: z.string().max(128),
    audioPayloadBase64: z.string().max(10_000_000),
  }),
  z.object({
    type: z.literal('peer:leave'),
    peerId: z.string().min(1).max(64),
    reason: z.string().max(200).optional(),
  }),
]);

export type ControlMessage = z.infer<typeof controlMessageSchema>;
export type ControlMessageType = ControlMessage['type'];
export type FileEndMessage = Extract<ControlMessage, { type: 'file-end' }>;
export type ResumeStateMessage = Extract<ControlMessage, { type: 'resume-state' }>;
export type ProgressMessage = Extract<ControlMessage, { type: 'progress' }>;
export type MetaMessage = Extract<ControlMessage, { type: 'meta' }>;
export type AcceptMessage = Extract<ControlMessage, { type: 'accept' }>;
export type HelloMessage = Extract<ControlMessage, { type: 'hello' }>;
export type PeerError = z.infer<typeof peerErrorSchema>;

export function encodeControlMessage(message: ControlMessage): string {
  return JSON.stringify(message);
}

export type ControlParseResult =
  | { ok: true; message: ControlMessage }
  | { ok: false; error: string };

/** Parse untrusted peer input. Never throws. */
export function parseControlMessage(raw: unknown): ControlParseResult {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 16_000_000) {
    return { ok: false, error: 'Control message must be a non-empty string under 16 MB' };
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Control message is not valid JSON' };
  }
  const parsed = controlMessageSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: 'Control message failed schema validation' };
  }
  return { ok: true, message: parsed.data };
}

export function isProtocolCompatible(version: number): boolean {
  return version === PROTOCOL_VERSION;
}

/**
 * Metadata is produced locally from `File` objects. The relative path preserves
 * folder structure; everything is validated on the receiving side.
 */
export interface FileLike {
  name: string;
  size: number;
  type: string;
  lastModified: number;
  webkitRelativePath?: string;
}

export function toSharedFileMeta(file: FileLike, index: number): SharedFileMeta {
  const relativePath =
    typeof file.webkitRelativePath === 'string' && file.webkitRelativePath.length > 0
      ? file.webkitRelativePath
      : file.name;
  return {
    index,
    name: file.name,
    relativePath,
    size: file.size,
    mime: file.type || 'application/octet-stream',
    lastModified: file.lastModified,
  };
}
