import type { SharedFileMeta } from '@shared/protocol.js';
import { toSharedFileMeta } from '@shared/protocol.js';
import type { FileSource } from './types.js';

/** File/Blob-backed source. Only one chunk is materialised at a time. */
export class BlobFileSource implements FileSource {
  constructor(
    private readonly blob: Blob,
    readonly meta: SharedFileMeta,
  ) {}

  async read(start: number, endExclusive: number): Promise<Uint8Array> {
    if (start < 0 || endExclusive < start || endExclusive > this.meta.size) {
      throw new RangeError(`Invalid read range ${start}-${endExclusive} for ${this.meta.size} bytes`);
    }
    const buffer = await this.blob.slice(start, endExclusive).arrayBuffer();
    return new Uint8Array(buffer);
  }
}

export interface FileWithPath extends File {
  readonly webkitRelativePath: string;
}

export function createFileSources(files: File[]): Array<{ file: File; source: FileSource }> {
  return files.map((file, index) => {
    const meta = toSharedFileMeta(file, index);
    return { file, source: new BlobFileSource(file, meta) };
  });
}
