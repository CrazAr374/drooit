import type { SharedFileMeta } from '@shared/protocol.js';
import type { Sink, SinkFactory } from './types.js';

/**
 * Origin Private File System (OPFS) sink. Streams incoming chunks directly to disk
 * via browser sandboxed storage so multi-gigabyte files do not exhaust JavaScript heap
 * or cause page crashes / reloads on mobile and desktop.
 */
export class OpfsSink implements Sink {
  private fileHandle: FileSystemFileHandle | null = null;
  private writable: FileSystemWritableFileStream | null = null;
  private size = 0;

  constructor(
    private readonly _meta: SharedFileMeta,
    private readonly filename: string,
    private readonly rootDir: FileSystemDirectoryHandle,
  ) {}

  get meta(): SharedFileMeta {
    return this._meta;
  }

  async init(): Promise<void> {
    this.fileHandle = await this.rootDir.getFileHandle(this.filename, { create: true });
    this.writable = await this.fileHandle.createWritable({ keepExistingData: false });
  }

  get bytesWritten(): number {
    return this.size;
  }

  async write(offset: number, data: Uint8Array): Promise<void> {
    if (!this.writable) {
      throw new Error('OPFS sink is not open for writing');
    }
    if (data.byteLength === 0) return;
    await this.writable.seek(offset);
    await this.writable.write(data as unknown as BufferSource);
    this.size += data.byteLength;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    if (!this.fileHandle) return new Uint8Array(0);
    const file = await this.fileHandle.getFile();
    const slice = file.slice(offset, offset + length);
    const buf = await slice.arrayBuffer();
    return new Uint8Array(buf);
  }

  async finalize(): Promise<{ blob: Blob; savedToDisk: true }> {
    if (this.writable) {
      await this.writable.close();
      this.writable = null;
    }
    if (!this.fileHandle) {
      throw new Error('File handle missing on finalize');
    }
    const file = await this.fileHandle.getFile();
    return {
      blob: file,
      savedToDisk: true,
    };
  }

  async abort(): Promise<void> {
    try {
      if (this.writable) {
        await this.writable.abort();
        this.writable = null;
      }
      await this.rootDir.removeEntry(this.filename);
    } catch {
      // Ignore cleanup error if already removed
    }
    this.size = 0;
  }
}

export class OpfsSinkFactory implements SinkFactory {
  readonly kind = 'opfs' as const;
  private rootDir: FileSystemDirectoryHandle | null = null;
  private readonly sinks = new Map<number, OpfsSink>();

  static isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.storage !== 'undefined' &&
      typeof navigator.storage.getDirectory === 'function'
    );
  }

  private async getRoot(): Promise<FileSystemDirectoryHandle> {
    if (!this.rootDir) {
      this.rootDir = await navigator.storage.getDirectory();
    }
    return this.rootDir;
  }

  async open(meta: SharedFileMeta): Promise<Sink> {
    const existing = this.sinks.get(meta.index);
    if (existing) return existing;
    const root = await this.getRoot();
    const filename = `drooit_${meta.index}_${Date.now()}.part`;
    const sink = new OpfsSink(meta, filename, root);
    await sink.init();
    this.sinks.set(meta.index, sink);
    return sink;
  }

  async cleanup(): Promise<void> {
    await Promise.all([...this.sinks.values()].map((s) => s.abort()));
    this.sinks.clear();
  }
}
