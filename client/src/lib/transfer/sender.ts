import {
  BUFFER_HIGH_WATER,
  PROTOCOL_VERSION,
} from '@shared/constants.js';
import {
  encodeChunkFrame,
  type ControlMessage,
  type ResumeStateMessage,
} from '@shared/protocol.js';
import type { DeviceInfo } from '@shared/types.js';
import { Sha256 } from '@shared/sha256.js';
import { SpeedMeter } from './speed.js';
import type {
  FileSource,
  FileTransferStatus,
  SenderPhase,
  SenderSnapshot,
  TransferChannel,
} from './types.js';

const HASH_READ_SIZE = 4 * 1024 * 1024;
const DEFAULT_CHUNK_SIZE = 256 * 1024;

interface SenderFileState {
  source: FileSource;
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

interface VerificationWaiter {
  resolve: (result: { ok: boolean; error?: string }) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface SenderEngineOptions {
  sources: FileSource[];
  device: DeviceInfo;
  channel: TransferChannel;
  chunkSize?: number;
  now?: () => number;
  onUpdate?: (snapshot: SenderSnapshot) => void;
  /** How long to wait for the receiver to verify a file. */
  verificationTimeoutMs?: number;
  /** Grace period for the receiver's resume-state after accepting. */
  resumeGraceMs?: number;
}

/**
 * Sender-side transfer engine.
 *
 * Owns chunking, backpressure, per-file hashing and resume. Transport-agnostic:
 * the WebRTC layer supplies a `TransferChannel`, tests supply a fake one.
 */
export class SenderEngine {
  private readonly files: SenderFileState[];
  private readonly device: DeviceInfo;
  private readonly chunkSize: number;
  private readonly now: () => number;
  private readonly onUpdate?: (snapshot: SenderSnapshot) => void;
  private readonly verificationTimeoutMs: number;
  private readonly resumeGraceMs: number;
  private readonly speed: SpeedMeter;

  private channel: TransferChannel;
  private phase: SenderPhase = 'idle';
  private accepted: Set<number> | null = null;
  private resumeState: ResumeStateMessage | null = null;
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  private runPromise: Promise<void> | null = null;
  private abort = new AbortController();
  private interrupted = false;
  private runToken = 0;
  private paused = false;
  private pauseWaiters: Array<() => void> = [];
  private readonly hashers = new Map<number, { hasher: Sha256; hashedBytes: number }>();
  private readonly verificationWaiters = new Map<number, VerificationWaiter>();
  private startedAt: number | null = null;
  private completedAt: number | null = null;
  private error: { code: string; message: string } | null = null;
  private lastEmit = 0;
  private announced = false;

  constructor(options: SenderEngineOptions) {
    if (options.sources.length === 0) throw new Error('SenderEngine requires at least one file');
    this.files = options.sources.map((source) => ({
      source,
      index: source.meta.index,
      name: source.meta.name,
      relativePath: source.meta.relativePath,
      size: source.meta.size,
      sentBytes: 0,
      receivedBytes: 0,
      status: 'pending',
    }));
    this.device = options.device;
    this.channel = options.channel;
    this.chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    this.now = options.now ?? Date.now;
    this.onUpdate = options.onUpdate;
    this.verificationTimeoutMs = options.verificationTimeoutMs ?? 120_000;
    this.resumeGraceMs = options.resumeGraceMs ?? 2_000;
    this.speed = new SpeedMeter(3_000, this.now);
  }

  get snapshot(): SenderSnapshot {
    const totalBytes = this.files.reduce((sum, file) => sum + file.size, 0);
    const transferredBytes = this.files.reduce(
      (sum, file) => sum + (file.status === 'done' ? file.size : Math.min(file.receivedBytes, file.size)),
      0,
    );
    const remaining = Math.max(0, totalBytes - transferredBytes);
    return {
      phase: this.phase,
      files: this.files.map((file) => ({
        index: file.index,
        name: file.name,
        relativePath: file.relativePath,
        size: file.size,
        sentBytes: file.sentBytes,
        receivedBytes: file.receivedBytes,
        status: file.status,
        sha256: file.sha256,
        error: file.error,
      })),
      totalBytes,
      transferredBytes,
      speedBps: this.speed.rate(this.now()),
      etaSeconds: this.speed.etaSeconds(remaining, this.now()),
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      error: this.error,
    };
  }

  /** Sends hello + metadata and waits for the receiver to accept. */
  start(): void {
    if (this.announced) return;
    this.announced = true;
    this.phase = 'waiting';
    this.sendHelloAndMeta();
    this.emit(true);
  }

  attachChannel(channel: TransferChannel): void {
    this.channel = channel;
  }

  /**
   * Called when the peer connection drops. Stops the current loop without marking
   * the transfer failed; a later `attachChannel` + `start()` resumes from acked
   * offsets using the receiver's state.
   */
  interrupt(): void {
    this.interrupted = true;
    this.runToken += 1;
    this.abort.abort();
    this.abort = new AbortController();
    this.flushPauseWaiters();
    for (const waiter of this.verificationWaiters.values()) {
      clearTimeout(waiter.timer);
      waiter.resolve({ ok: false, error: 'Connection interrupted' });
    }
    this.verificationWaiters.clear();
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.resumeTimer = null;
    this.accepted = null;
    this.resumeState = null;
    this.announced = false;
    this.paused = false;
    if (this.phase !== 'completed' && this.phase !== 'cancelled') {
      this.phase = 'waiting';
      this.error = null;
      this.emit(true);
    }
  }

  async handleControl(message: ControlMessage): Promise<void> {
    switch (message.type) {
      case 'accept': {
        const indexes = new Set(message.fileIndexes);
        this.accepted = indexes;
        for (const file of this.files) {
          if (!indexes.has(file.index)) file.status = 'skipped';
        }
        this.beginIfReady();
        return;
      }
      case 'resume-state': {
        this.resumeState = message;
        this.beginIfReady();
        return;
      }
      case 'progress': {
        const file = this.files.find((candidate) => candidate.index === message.fileIndex);
        if (!file) return;
        const previous = file.receivedBytes;
        if (message.receivedBytes <= file.size) {
          file.receivedBytes = Math.max(previous, message.receivedBytes);
          this.speed.record(file.receivedBytes - previous, this.now());
          this.emit();
        }
        return;
      }
      case 'file-verified': {
        const waiter = this.verificationWaiters.get(message.fileIndex);
        if (waiter) {
          clearTimeout(waiter.timer);
          this.verificationWaiters.delete(message.fileIndex);
          waiter.resolve({ ok: message.ok, error: message.error });
        }
        return;
      }
      case 'pause': {
        this.pause();
        return;
      }
      case 'resume': {
        this.resume();
        return;
      }
      case 'cancel': {
        await this.cancel(message.reason ?? 'The receiver cancelled the transfer');
        return;
      }
      case 'reject': {
        this.phase = 'cancelled';
        this.error = { code: 'REJECTED', message: 'The receiver declined this transfer.' };
        this.runToken += 1;
        this.abort.abort();
        this.flushPauseWaiters();
        this.emit(true);
        return;
      }
      case 'error': {
        this.fail('PEER_ERROR', message.message);
        return;
      }
      case 'restart': {
        await this.restart();
        return;
      }
      default:
        return;
    }
  }

  pause(): void {
    if (this.phase !== 'transferring' || this.paused) return;
    this.paused = true;
    this.phase = 'paused';
    this.safeSend({ type: 'pause', reason: 'Sender paused' });
    this.emit(true);
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.phase === 'paused') this.phase = 'transferring';
    this.safeSend({ type: 'resume' });
    this.flushPauseWaiters();
    this.emit(true);
  }

  async cancel(reason = 'Cancelled by sender'): Promise<void> {
    if (this.phase === 'completed' || this.phase === 'cancelled') return;
    this.phase = 'cancelled';
    this.error = null;
    this.runToken += 1;
    this.abort.abort();
    this.flushPauseWaiters();
    for (const waiter of this.verificationWaiters.values()) {
      clearTimeout(waiter.timer);
      waiter.resolve({ ok: false, error: 'Cancelled' });
    }
    this.verificationWaiters.clear();
    this.safeSend({ type: 'cancel', reason });
    this.emit(true);
  }

  private beginIfReady(): void {
    if (this.accepted === null) return;
    if (this.resumeState === null && this.resumeGraceMs > 0) {
      if (this.resumeTimer) return;
      this.resumeTimer = setTimeout(() => {
        this.resumeTimer = null;
        this.beginIfReady();
      }, this.resumeGraceMs);
      return;
    }
    if (this.runPromise) {
      // A previous loop is still unwinding after an interrupt. Retry shortly.
      if (this.resumeTimer) return;
      this.resumeTimer = setTimeout(() => {
        this.resumeTimer = null;
        this.beginIfReady();
      }, 50);
      return;
    }
    if (this.resumeTimer) clearTimeout(this.resumeTimer);
    this.resumeTimer = null;

    if (this.resumeState) {
      for (const entry of this.resumeState.files) {
        const file = this.files.find((candidate) => candidate.index === entry.fileIndex);
        if (!file) continue;
        if (entry.complete && entry.sha256) {
          file.status = 'done';
          file.receivedBytes = file.size;
          file.sentBytes = file.size;
          file.sha256 = entry.sha256;
        } else {
          file.receivedBytes = Math.min(entry.receivedBytes, file.size);
        }
      }
    }
    this.resumeState = null;
    this.phase = 'transferring';
    this.startedAt = this.startedAt ?? this.now();
    this.interrupted = false;
    const token = ++this.runToken;
    const runPromise = this.run(token);
    this.runPromise = runPromise;
    void runPromise.finally(() => {
      if (this.runPromise === runPromise) this.runPromise = null;
    });
  }

  private async run(token: number): Promise<void> {
    this.emit(true);
    try {
      for (const file of this.files) {
        if (!this.isActive(token)) return;
        if (file.status === 'done' || file.status === 'skipped') continue;
        if (!this.accepted?.has(file.index)) continue;
        await this.sendFile(file, token);
      }
      if (!this.isActive(token)) return;
      this.phase = 'completed';
      this.completedAt = this.now();
      this.safeSend({
        type: 'done',
        ok: true,
        totalBytes: this.files.reduce((sum, file) => sum + file.size, 0),
        fileCount: this.files.filter((file) => file.status === 'done').length,
      });
      this.emit(true);
    } catch (error) {
      if (!this.isActive(token)) return;
      const message = error instanceof Error ? error.message : 'The transfer failed unexpectedly.';
      this.fail('TRANSFER_FAILED', message);
    }
  }

  private isActive(token: number): boolean {
    return token === this.runToken && !this.interrupted && !this.abort.signal.aborted;
  }

  private async sendFile(file: SenderFileState, token: number): Promise<void> {
    const resumeOffset = Math.floor(file.receivedBytes / this.chunkSize) * this.chunkSize;
    const startByte = Math.min(resumeOffset, file.size);
    await this.ensureHashAt(file, startByte);
    if (!this.isActive(token)) return;

    file.status = 'sending';
    file.sentBytes = Math.max(file.sentBytes, startByte);
    this.safeSend({ type: 'file-begin', fileIndex: file.index, startByte, chunkSize: this.chunkSize });
    this.emit(true);

    const hasherState = this.hashers.get(file.index)!;
    let offset = startByte;
    while (offset < file.size) {
      if (!this.isActive(token)) return;
      await this.waitWhilePaused();
      if (!this.isActive(token)) return;
      while (this.channel.bufferedAmount > BUFFER_HIGH_WATER) {
        await this.channel.waitForDrain(this.abort.signal);
        if (!this.isActive(token)) return;
      }
      const end = Math.min(offset + this.chunkSize, file.size);
      const chunk = await file.source.read(offset, end);
      if (!this.isActive(token)) return;
      if (chunk.byteLength === 0 && file.size > 0) {
        throw new Error(`Could not read "${file.name}" — the file may have moved or changed.`);
      }
      hasherState.hasher.update(chunk);
      hasherState.hashedBytes += chunk.byteLength;
      const chunkIndex = offset / this.chunkSize;
      this.channel.sendFrame(encodeChunkFrame(file.index, chunkIndex, chunk));
      file.sentBytes = offset + chunk.byteLength;
      offset += chunk.byteLength;
      this.emit();
    }
    if (!this.isActive(token)) return;

    if (hasherState.hashedBytes !== file.size) {
      throw new Error(`Hash computation for "${file.name}" was incomplete.`);
    }
    file.sha256 = hasherState.hasher.digestHex();
    file.status = 'verifying';
    this.safeSend({ type: 'file-end', fileIndex: file.index, sha256: file.sha256, size: file.size });
    this.emit(true);

    const result = await this.waitForVerification(file.index);
    if (!this.isActive(token)) return;
    if (!result.ok) {
      file.status = 'failed';
      file.error = result.error ?? 'Integrity verification failed';
      throw new Error(`Integrity check failed for "${file.name}".`);
    }
    file.status = 'done';
    file.receivedBytes = file.size;
    this.emit(true);
  }

  private waitForVerification(fileIndex: number): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.verificationWaiters.delete(fileIndex);
        resolve({ ok: false, error: 'Timed out waiting for verification' });
      }, this.verificationTimeoutMs);
      this.verificationWaiters.set(fileIndex, { resolve, timer });
    });
  }

  private async ensureHashAt(file: SenderFileState, target: number): Promise<void> {
    let state = this.hashers.get(file.index);
    if (!state) {
      state = { hasher: new Sha256(), hashedBytes: 0 };
      this.hashers.set(file.index, state);
    }
    if (target < state.hashedBytes) {
      // The receiver acknowledged less than we already hashed (in-flight chunks
      // were lost). Re-read the prefix so the final digest covers exactly the
      // bytes the receiver holds.
      state.hasher = new Sha256();
      state.hashedBytes = 0;
    }
    while (state.hashedBytes < target) {
      const end = Math.min(target, state.hashedBytes + HASH_READ_SIZE);
      const data = await file.source.read(state.hashedBytes, end);
      if (data.byteLength === 0) {
        throw new Error(`File "${file.name}" ended before ${target} bytes could be read.`);
      }
      state.hasher.update(data);
      state.hashedBytes += data.byteLength;
    }
  }

  private sendHelloAndMeta(): void {
    this.safeSend({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      sender: this.device,
      fileCount: this.files.length,
      totalBytes: this.files.reduce((sum, file) => sum + file.size, 0),
    });
    this.safeSend({
      type: 'meta',
      files: this.files.map((file) => ({
        index: file.index,
        name: file.name,
        relativePath: file.relativePath,
        size: file.size,
        mime: file.source.meta.mime,
        lastModified: file.source.meta.lastModified,
      })),
    });
  }

  private async restart(): Promise<void> {
    this.runToken += 1;
    this.abort.abort();
    this.abort = new AbortController();
    this.flushPauseWaiters();
    this.interrupted = true;
    this.hashers.clear();
    this.verificationWaiters.forEach((waiter) => {
      clearTimeout(waiter.timer);
      waiter.resolve({ ok: false, error: 'Restarted' });
    });
    this.verificationWaiters.clear();
    for (const file of this.files) {
      file.sentBytes = 0;
      file.receivedBytes = 0;
      file.status = 'pending';
      file.sha256 = undefined;
      file.error = undefined;
    }
    this.accepted = null;
    this.resumeState = null;
    this.phase = 'waiting';
    this.error = null;
    this.speed.reset();
    this.sendHelloAndMeta();
    this.emit(true);
  }

  private async waitWhilePaused(): Promise<void> {
    while (this.paused && !this.abort.signal.aborted) {
      await new Promise<void>((resolve) => this.pauseWaiters.push(resolve));
    }
  }

  private flushPauseWaiters(): void {
    const waiters = this.pauseWaiters;
    this.pauseWaiters = [];
    for (const resolve of waiters) resolve();
  }

  private safeSend(message: ControlMessage): void {
    try {
      if (this.channel.isOpen) this.channel.sendControl(message);
    } catch {
      // The connection dropped; the manager will re-attach and resume.
    }
  }

  private fail(code: string, message: string): void {
    if (this.phase === 'cancelled' || this.phase === 'completed') return;
    this.phase = 'error';
    this.error = { code, message };
    this.safeSend({ type: 'error', code, message });
    this.emit(true);
  }

  private emit(force = false): void {
    if (!this.onUpdate) return;
    const now = this.now();
    if (!force && now - this.lastEmit < 100) return;
    this.lastEmit = now;
    this.onUpdate(this.snapshot);
  }
}
