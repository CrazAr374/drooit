import type { SinkFactory } from './types.js';
import { MemorySinkFactory } from './memorySink.js';
import { OpfsSinkFactory } from './opfsSink.js';

/**
 * Creates the most resilient sink factory available in the current runtime:
 * uses OPFS (Origin Private File System) on disk to stream chunks with zero heap
 * growth, falling back to MemorySink with sub-blob compaction on legacy platforms.
 */
export function createDefaultSinkFactory(): SinkFactory {
  if (OpfsSinkFactory.isSupported()) {
    return new OpfsSinkFactory();
  }
  return new MemorySinkFactory();
}
