import type { SharedFileMeta } from '@shared/protocol.js';
import type { Sink, SinkFactory } from './types.js';

/**
 * In-memory sink used for small transfers and tests. Data is copied on write so
 * callers can safely reuse the frame buffer.
 */
export class MemorySink implements Sink {
  private parts: Uint8Array[] = [];
  private size = 0;

  constructor(private readonly meta: SharedFileMeta) {}

  get bytesWritten(): number {
    return this.size;
  }

  async write(offset: number, data: Uint8Array): Promise<void> {
    if (offset !== this.size) {
      throw new Error(`Out-of-order write: expected offset ${this.size}, received ${offset}`);
    }
    if (data.byteLength === 0) return;
    this.parts.push(data.slice());
    this.size += data.byteLength;
  }

  async read(offset: number, length: number): Promise<Uint8Array> {
    const end = Math.min(offset + length, this.size);
    if (offset < 0 || offset >= end) return new Uint8Array(0);
    const output = new Uint8Array(end - offset);
    let cursor = 0;
    let written = 0;
    for (const part of this.parts) {
      const partEnd = cursor + part.byteLength;
      if (partEnd <= offset) {
        cursor = partEnd;
        continue;
      }
      if (cursor >= end) break;
      const from = Math.max(0, offset - cursor);
      const to = Math.min(part.byteLength, end - cursor);
      output.set(part.subarray(from, to), written);
      written += to - from;
      cursor = partEnd;
    }
    return output;
  }

  async finalize(): Promise<{ blob: Blob; savedToDisk: false }> {
    return {
      blob: new Blob(this.parts as BlobPart[], { type: this.meta.mime || 'application/octet-stream' }),
      savedToDisk: false,
    };
  }

  async abort(): Promise<void> {
    this.parts = [];
    this.size = 0;
  }
}

export class MemorySinkFactory implements SinkFactory {
  readonly kind = 'memory' as const;
  private readonly sinks = new Map<number, MemorySink>();

  async open(meta: SharedFileMeta): Promise<Sink> {
    const existing = this.sinks.get(meta.index);
    if (existing) return existing;
    const sink = new MemorySink(meta);
    this.sinks.set(meta.index, sink);
    return sink;
  }

  async cleanup(): Promise<void> {
    await Promise.all([...this.sinks.values()].map((sink) => sink.abort()));
    this.sinks.clear();
  }
}
