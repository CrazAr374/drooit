import {
  MAX_CHUNK_SIZE,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_SESSION,
  MAX_SESSION_BYTES,
  PROTOCOL_VERSION,
} from '@shared/constants.js';
import { decodeChunkFrame, type ControlMessage, type SharedFileMeta } from '@shared/protocol.js';
import { sanitizeFilename, sanitizeRelativePath } from '@shared/paths.js';
import { Sha256 } from '@shared/sha256.js';
import { SpeedMeter } from './speed.js';
import type {
  FileTransferStatus,
  ReceivedFile,
  ReceiverFileProgress,
  ReceiverPhase,
  ReceiverSnapshot,
  Sink,
  SinkFactory,
  TransferChannel,
} from './types.js';

interface ReceiverFileState {
  meta: SharedFileMeta;
  receivedBytes: number;
  status: FileTransferStatus;
  verified: boolean;
  sha256?: string;
  error?: string;
  sink: Sink | null;
  hasher: Sha256;
  chunkSize: number;
  lastAckAt: number;
  savedToDisk?: boolean;
}

export interface ReceiverEngineOptions {
  transferId: string;
  sinkFactory: SinkFactory;
  channel: TransferChannel;
  onUpdate?: (snapshot: ReceiverSnapshot) => void;
  onMeta?: (files: SharedFileMeta[], peerName: string | null) => void;
  onFileComplete?: (file: ReceivedFile) => void;
  onError?: (error: { code: string; message: string }) => void;
  now?: () => number;
  maxFiles?: number;
  maxTotalBytes?: number;
}

const ACK_INTERVAL_MS = 120;

/**
 * Receiver-side transfer engine.
 *
 * Reconstructs files chunk-by-chunk, hashes them incrementally, enforces
 * backpressure-aware ordering, and supports resuming from acknowledged offsets
 * after a peer-connection interruption.
 */
export class ReceiverEngine {
  private readonly transferId: string;
  private sinkFactory: SinkFactory;
  private channel: TransferChannel;
  private readonly onUpdate?: (snapshot: ReceiverSnapshot) => void;
  private readonly onMeta?: (files: SharedFileMeta[], peerName: string | null) => void;
  private readonly onFileComplete?: (file: ReceivedFile) => void;
  private readonly onError?: (error: { code: string; message: string }) => void;
  private readonly now: () => number;
  private readonly maxFiles: number;
  private readonly maxTotalBytes: number;

  private readonly files = new Map<number, ReceiverFileState>();
  private accepted = false;
  private acceptedIndexes = new Set<number>();
  private phase: ReceiverPhase = 'awaiting-meta';
  private peerName: string | null = null;
  private startedAt: number | null = null;
  private completedAt: number | null = null;
  private error: { code: string; message: string } | null = null;
  private readonly speed: SpeedMeter;
  private queue: Promise<void> = Promise.resolve();
  private lastEmit = 0;
  private disposed = false;

  constructor(options: ReceiverEngineOptions) {
    this.transferId = options.transferId;
    void this.transferId;
    this.sinkFactory = options.sinkFactory;
    this.channel = options.channel;
    this.onUpdate = options.onUpdate;
    this.onMeta = options.onMeta;
    this.onFileComplete = options.onFileComplete;
    this.onError = options.onError;
    this.now = options.now ?? Date.now;
    this.maxFiles = options.maxFiles ?? MAX_FILES_PER_SESSION;
    this.maxTotalBytes = options.maxTotalBytes ?? MAX_SESSION_BYTES;
    this.speed = new SpeedMeter(3_000, this.now);
  }

  get snapshot(): ReceiverSnapshot {
    const files = [...this.files.values()];
    const totalBytes = files.reduce((sum, file) => sum + file.meta.size, 0);
    const receivedBytes = files.reduce(
      (sum, file) => sum + (file.status === 'done' ? file.meta.size : Math.min(file.receivedBytes, file.meta.size)),
      0,
    );
    const remaining = Math.max(0, totalBytes - receivedBytes);
    return {
      phase: this.phase,
      peerName: this.peerName,
      files: files.map<ReceiverFileProgress>((file) => ({
        index: file.meta.index,
        name: file.meta.name,
        relativePath: file.meta.relativePath,
        size: file.meta.size,
        receivedBytes: file.receivedBytes,
        status: file.status,
        verified: file.verified,
        sha256: file.sha256,
        error: file.error,
        savedToDisk: file.savedToDisk,
      })),
      totalBytes,
      receivedBytes,
      speedBps: this.speed.rate(this.now()),
      etaSeconds: this.speed.etaSeconds(remaining, this.now()),
      error: this.error,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
    };
  }

  get isAccepted(): boolean {
    return this.accepted;
  }

  get currentPhase(): ReceiverPhase {
    return this.phase;
  }

  attachChannel(channel: TransferChannel): void {
    this.channel = channel;
  }

  setSinkFactory(factory: SinkFactory): void {
    if (this.accepted) throw new Error('Cannot change the sink after accepting');
    this.sinkFactory = factory;
  }

  /** Wires the manager to the engine; also used after a peer-connection restart. */
  start(): void {
    this.emit(true);
  }

  handleControl(message: ControlMessage): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.queue = this.queue
      .then(() => this.processControl(message))
      .catch((error) => this.failFromError(error));
    return this.queue;
  }

  handleBinary(buffer: ArrayBuffer): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.queue = this.queue
      .then(() => this.processBinary(buffer))
      .catch((error) => this.failFromError(error));
    return this.queue;
  }

  /** Sends the accept + resume-state pair; sinks must already be open. */
  async accept(indexes?: number[]): Promise<void> {
    if (this.accepted) return;
    if (this.files.size === 0) throw new Error('No file list has been received yet');
    const selected = indexes ?? [...this.files.keys()];
    const selectedSet = new Set(selected);
    if (selectedSet.size === 0) throw new Error('Select at least one file');

    this.phase = 'preparing';
    this.emit(true);
    try {
      for (const [index, state] of this.files) {
        if (!selectedSet.has(index)) {
          state.status = 'skipped';
          continue;
        }
        state.sink = await this.sinkFactory.open(state.meta);
      }
    } catch (error) {
      this.failFromError(error);
      throw error;
    }

    this.accepted = true;
    this.acceptedIndexes = selectedSet;
    this.phase = 'transferring';
    this.startedAt = this.now();
    // Send state before acceptance so the sender can start without a grace delay.
    this.sendResumeState();
    this.safeSend({ type: 'accept', fileIndexes: [...selectedSet] });
    this.emit(true);
  }

  reject(reason = 'Declined by receiver'): void {
    if (this.accepted) return;
    this.phase = 'rejected';
    this.safeSend({ type: 'reject', reason });
    void this.cleanup();
    this.emit(true);
  }

  pause(): void {
    if (this.phase !== 'transferring') return;
    this.phase = 'paused';
    this.safeSend({ type: 'pause', reason: 'Receiver paused' });
    this.emit(true);
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'transferring';
    this.safeSend({ type: 'resume' });
    this.emit(true);
  }

  cancel(reason = 'Cancelled by receiver'): void {
    if (this.phase === 'completed' || this.phase === 'cancelled') return;
    this.phase = 'cancelled';
    this.safeSend({ type: 'cancel', reason });
    void this.cleanup();
    this.emit(true);
  }

  /** Asks the sender to rewind all files and start over (after an error). */
  async retry(): Promise<void> {
    await this.cleanup();
    this.files.clear();
    this.accepted = false;
    this.acceptedIndexes.clear();
    this.phase = 'awaiting-meta';
    this.error = null;
    this.startedAt = null;
    this.completedAt = null;
    this.speed.reset();
    this.safeSend({ type: 'restart' });
    this.emit(true);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (this.phase !== 'completed') await this.cleanup();
  }

  private async processControl(message: ControlMessage): Promise<void> {
    switch (message.type) {
      case 'hello': {
        if (message.protocolVersion !== PROTOCOL_VERSION) {
          this.fail(
            'UNSUPPORTED_VERSION',
            'The other device is running a different version of Drooit. Reload both devices and try again.',
          );
          return;
        }
        this.peerName = message.sender.name;
        this.emit(true);
        return;
      }
      case 'meta': {
        await this.handleMeta(message.files);
        return;
      }
      case 'file-begin': {
        const state = this.files.get(message.fileIndex);
        if (!state || !this.acceptedIndexes.has(message.fileIndex)) return;
        if (!Number.isInteger(message.chunkSize) || message.chunkSize <= 0 || message.chunkSize > MAX_CHUNK_SIZE) {
          throw new Error('The sender proposed an invalid chunk size');
        }
        if (message.startByte > state.receivedBytes) {
          throw new Error(`The sender resumed at ${message.startByte} but only ${state.receivedBytes} bytes were stored`);
        }
        if (!state.sink) throw new Error('No storage sink is open for this file');
        state.chunkSize = message.chunkSize;
        state.status = 'sending';
        if (this.phase !== 'paused') this.phase = 'transferring';
        this.startedAt = this.startedAt ?? this.now();
        this.emit(true);
        return;
      }
      case 'file-end': {
        await this.handleFileEnd(message.fileIndex, message.sha256, message.size);
        return;
      }
      case 'pause': {
        if (this.phase === 'transferring') {
          this.phase = 'paused';
          this.emit(true);
        }
        return;
      }
      case 'resume': {
        if (this.phase === 'paused') {
          this.phase = 'transferring';
          this.emit(true);
        }
        return;
      }
      case 'cancel': {
        this.phase = 'cancelled';
        this.error = message.reason ? { code: 'CANCELLED', message: message.reason } : null;
        void this.cleanup();
        this.emit(true);
        return;
      }
      case 'done': {
        this.phase = 'completed';
        this.completedAt = this.now();
        this.emit(true);
        return;
      }
      case 'error': {
        // Keep a more specific local failure (e.g. integrity) if we already have one.
        if (this.phase !== 'error' || !this.error) {
          this.phase = 'error';
          this.error = { code: message.code, message: message.message };
        }
        this.emit(true);
        return;
      }
      case 'restart': {
        // Reserved for a sender-initiated restart; the current protocol only
        // sends `restart` receiver-to-sender, so there is nothing to do here.
        return;
      }
      case 'ping': {
        this.safeSend({ type: 'pong', t: message.t });
        return;
      }
      default:
        return;
    }
  }

  private async handleMeta(files: SharedFileMeta[]): Promise<void> {
    if (files.length === 0 || files.length > this.maxFiles) {
      throw new Error('The sender offered an invalid number of files');
    }
    const unique = new Set<number>();
    let totalBytes = 0;
    const normalized: SharedFileMeta[] = files.map((file) => {
      if (unique.has(file.index)) throw new Error('The sender offered duplicate file identifiers');
      unique.add(file.index);
      if (file.size > MAX_FILE_SIZE_BYTES) throw new Error(`"${file.name}" exceeds the maximum file size`);
      totalBytes += file.size;
      const safeName = sanitizeFilename(file.name);
      return {
        ...file,
        name: safeName,
        relativePath: sanitizeRelativePath(file.relativePath, safeName),
        mime: file.mime.slice(0, 255) || 'application/octet-stream',
      };
    });
    if (totalBytes > this.maxTotalBytes) {
      throw new Error('This transfer exceeds the maximum session size');
    }

    const isSameSet =
      this.files.size === normalized.length &&
      normalized.every((file) => {
        const existing = this.files.get(file.index);
        return existing && existing.meta.size === file.size && existing.meta.relativePath === file.relativePath;
      });

    if (isSameSet) {
      if (this.accepted) {
        // Peer connection was re-established: report exactly which bytes are
        // already stored, then re-affirm acceptance.
        this.sendResumeState();
        this.safeSend({ type: 'accept', fileIndexes: [...this.acceptedIndexes] });
        this.phase = 'transferring';
        this.emit(true);
      }
      return;
    }

    await this.cleanup();
    this.files.clear();
    this.accepted = false;
    this.acceptedIndexes.clear();
    for (const file of normalized) {
      this.files.set(file.index, {
        meta: file,
        receivedBytes: 0,
        status: 'pending',
        verified: false,
        sink: null,
        hasher: new Sha256(),
        chunkSize: 0,
        lastAckAt: 0,
      });
    }
    this.phase = 'review';
    this.error = null;
    this.completedAt = null;
    this.startedAt = null;
    this.onMeta?.(normalized, this.peerName);
    this.emit(true);
  }

  private async processBinary(buffer: ArrayBuffer): Promise<void> {
    if (!this.accepted || (this.phase !== 'transferring' && this.phase !== 'paused' && this.phase !== 'preparing')) {
      return;
    }
    const frame = decodeChunkFrame(buffer);
    const state = this.files.get(frame.fileIndex);
    if (!state || !this.acceptedIndexes.has(frame.fileIndex) || !state.sink) return;

    const chunkSize = state.chunkSize;
    if (!chunkSize) throw new Error('Received file data before the file header');
    const absoluteOffset = frame.chunkIndex * chunkSize;
    let payload = frame.payload;
    let offset = absoluteOffset;

    if (offset < state.receivedBytes) {
      const overlap = state.receivedBytes - offset;
      if (overlap >= payload.byteLength) return;
      payload = payload.subarray(overlap);
      offset = state.receivedBytes;
    }
    if (offset !== state.receivedBytes) {
      throw new Error('File data arrived with a gap; the transfer cannot continue');
    }
    if (state.receivedBytes + payload.byteLength > state.meta.size) {
      throw new Error('The sender sent more data than the declared file size');
    }

    await state.sink.write(offset, payload);
    state.hasher.update(payload);
    state.receivedBytes += payload.byteLength;
    this.speed.record(payload.byteLength, this.now());
    if (state.receivedBytes === state.meta.size) state.status = 'verifying';

    const now = this.now();
    if (state.receivedBytes === state.meta.size || now - state.lastAckAt >= ACK_INTERVAL_MS) {
      state.lastAckAt = now;
      this.sendProgress(state);
    }
    this.emit();
  }

  private async handleFileEnd(fileIndex: number, expectedSha: string, size: number): Promise<void> {
    const state = this.files.get(fileIndex);
    if (!state) throw new Error('File verification requested for an unknown file');
    if (!state.sink) throw new Error('File verification requested before acceptance');
    if (state.receivedBytes !== size || size !== state.meta.size) {
      throw new Error(`"${state.meta.name}" is incomplete (${state.receivedBytes} of ${size} bytes)`);
    }
    const digest = state.hasher.digestHex();
    if (digest !== expectedSha) {
      state.status = 'failed';
      state.error = 'Checksum mismatch';
      this.safeSend({ type: 'file-verified', fileIndex, ok: false, error: 'Checksum mismatch' });
      this.fail('INTEGRITY', `Integrity check failed for "${state.meta.name}". The file was not saved.`);
      return;
    }

    const finalized = await state.sink.finalize();
    state.status = 'done';
    state.verified = true;
    state.sha256 = digest;
    state.savedToDisk = finalized.savedToDisk;
    this.safeSend({ type: 'file-verified', fileIndex, ok: true });
    this.sendProgress(state);
    this.onFileComplete?.({
      meta: state.meta,
      sha256: digest,
      verified: true,
      blob: finalized.blob,
      savedToDisk: finalized.savedToDisk,
      path: finalized.path,
    });
    this.emit(true);

    const allDone = [...this.files.values()]
      .filter((file) => this.acceptedIndexes.has(file.meta.index))
      .every((file) => file.verified);
    if (allDone) {
      // The sender's `done` message is authoritative for phase, but reflecting
      // completion here keeps the UI responsive if it is delayed.
      this.phase = 'completed';
      this.completedAt = this.now();
      this.emit(true);
    }
  }

  private sendResumeState(): void {
    this.safeSend({
      type: 'resume-state',
      files: [...this.files.values()].map((state) => ({
        fileIndex: state.meta.index,
        receivedBytes: state.receivedBytes,
        complete: state.verified,
        sha256: state.sha256,
      })),
    });
  }

  private sendProgress(state: ReceiverFileState): void {
    this.safeSend({
      type: 'progress',
      fileIndex: state.meta.index,
      receivedBytes: state.receivedBytes,
    });
  }

  private async cleanup(): Promise<void> {
    try {
      await this.sinkFactory.cleanup();
    } catch {
      // Cleanup is best-effort; the transfer result must not hinge on it.
    }
    for (const state of this.files.values()) {
      state.sink = null;
    }
  }

  private failFromError(error: unknown): void {
    const message = error instanceof Error ? error.message : 'The transfer failed unexpectedly.';
    const quota = isQuotaError(error);
    this.fail(quota ? 'STORAGE_FULL' : 'TRANSFER_FAILED', quota ? 'This device ran out of storage space.' : message);
  }

  private fail(code: string, message: string): void {
    if (this.phase === 'completed' || this.phase === 'cancelled') return;
    this.phase = 'error';
    this.error = { code, message };
    this.safeSend({ type: 'error', code, message });
    this.onError?.({ code, message });
    this.emit(true);
  }

  private safeSend(message: ControlMessage): void {
    try {
      if (this.channel.isOpen) this.channel.sendControl(message);
    } catch {
      // The manager reconnects and re-sends state.
    }
  }

  private emit(force = false): void {
    if (!this.onUpdate) return;
    const now = this.now();
    if (!force && now - this.lastEmit < 100) return;
    this.lastEmit = now;
    this.onUpdate(this.snapshot);
  }
}

function isQuotaError(error: unknown): boolean {
  return (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}
