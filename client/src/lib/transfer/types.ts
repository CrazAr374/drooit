import type { ControlMessage, SharedFileMeta } from '@shared/protocol.js';

export interface FileSource {
  meta: SharedFileMeta;
  /** Reads `[start, endExclusive)` without loading the whole file. */
  read(start: number, endExclusive: number): Promise<Uint8Array>;
}

export interface TransferChannel {
  sendControl(message: ControlMessage): void;
  sendFrame(frame: ArrayBuffer): void;
  readonly bufferedAmount: number;
  /** Resolves when the channel drains below the low-water mark (or on abort). */
  waitForDrain(signal: AbortSignal): Promise<void>;
  readonly isOpen: boolean;
}

export type SenderPhase =
  | 'idle'
  | 'waiting'
  | 'transferring'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'error';

export type FileTransferStatus =
  | 'pending'
  | 'sending'
  | 'verifying'
  | 'done'
  | 'failed'
  | 'skipped';

export interface SenderFileProgress {
  index: number;
  name: string;
  relativePath: string;
  size: number;
  sentBytes: number;
  receivedBytes: number;
  status: FileTransferStatus;
  sha256?: string;
  error?: string;
}

export interface SenderSnapshot {
  phase: SenderPhase;
  files: SenderFileProgress[];
  totalBytes: number;
  transferredBytes: number;
  speedBps: number;
  etaSeconds: number;
  startedAt: number | null;
  completedAt: number | null;
  error: { code: string; message: string } | null;
}

export type ReceiverPhase =
  | 'awaiting-meta'
  | 'review'
  | 'preparing'
  | 'transferring'
  | 'paused'
  | 'completed'
  | 'rejected'
  | 'cancelled'
  | 'error';

export interface ReceivedFile {
  meta: SharedFileMeta;
  sha256: string;
  verified: boolean;
  /** Present when the file was retained in memory / IndexedDB for download. */
  blob?: Blob;
  /** True when written directly to a user-selected folder. */
  savedToDisk: boolean;
  path?: string;
}

export interface ReceiverFileProgress {
  index: number;
  name: string;
  relativePath: string;
  size: number;
  receivedBytes: number;
  status: FileTransferStatus;
  verified: boolean;
  sha256?: string;
  error?: string;
  savedToDisk?: boolean;
}

export interface ReceiverSnapshot {
  phase: ReceiverPhase;
  peerName: string | null;
  files: ReceiverFileProgress[];
  totalBytes: number;
  receivedBytes: number;
  speedBps: number;
  etaSeconds: number;
  error: { code: string; message: string } | null;
  startedAt: number | null;
  completedAt: number | null;
}

export interface Sink {
  readonly bytesWritten: number;
  write(offset: number, data: Uint8Array): Promise<void>;
  read(offset: number, length: number): Promise<Uint8Array>;
  finalize(): Promise<{ blob?: Blob; savedToDisk: boolean; path?: string }>;
  abort(): Promise<void>;
}

export interface SinkFactory {
  readonly kind: 'memory' | 'indexeddb' | 'directory' | 'opfs';
  open(meta: SharedFileMeta): Promise<Sink>;
  /** Removes any persisted partial data for this transfer. */
  cleanup(): Promise<void>;
}

export function sumBytes(files: Array<{ size: number }>): number {
  return files.reduce((total, file) => total + file.size, 0);
}
