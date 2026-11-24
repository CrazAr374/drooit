import type { ControlMessage } from '@shared/protocol.js';
import type { TransferChannel } from '@/lib/transfer/types.js';

type ControlHandler = (message: ControlMessage) => void;
type BinaryHandler = (buffer: ArrayBuffer) => void;

/**
 * In-memory, ordered, reliable channel pair that mimics an RTCDataChannel.
 * Delivery is asynchronous (queued) so engine backpressure semantics stay honest.
 */
export class MemoryChannel implements TransferChannel {
  bufferedAmount = 0;
  isOpen = true;
  peer: MemoryChannel | null = null;
  onControl: ControlHandler | null = null;
  onBinary: BinaryHandler | null = null;
  readonly sentFrames: number[] = [];
  readonly sentControls: ControlMessage[] = [];
  private drainWaiters: Array<() => void> = [];
  private queue: Array<() => void> = [];

  sendControl(message: ControlMessage): void {
    if (!this.isOpen) throw new Error('Channel closed');
    this.sentControls.push(message);
    this.enqueue(() => this.peer?.receiveControl(message));
  }

  sendFrame(frame: ArrayBuffer): void {
    if (!this.isOpen) throw new Error('Channel closed');
    this.sentFrames.push(frame.byteLength);
    this.bufferedAmount += frame.byteLength;
    this.enqueue(() => {
      this.bufferedAmount = Math.max(0, this.bufferedAmount - frame.byteLength);
      this.peer?.receiveBinary(frame);
      this.flushDrains();
    });
  }

  waitForDrain(signal: AbortSignal): Promise<void> {
    if (this.bufferedAmount === 0 || !this.isOpen) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        signal.removeEventListener('abort', done);
        resolve();
      };
      signal.addEventListener('abort', done, { once: true });
      this.drainWaiters.push(done);
    });
  }

  close(): void {
    this.isOpen = false;
    this.bufferedAmount = 0;
    this.queue = [];
    this.flushDrains();
  }

  /** Delivers every queued message and clears the queue. */
  async flush(): Promise<void> {
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      job();
      await Promise.resolve();
    }
  }

  private enqueue(job: () => void): void {
    this.queue.push(job);
    // Drain on the microtask queue so send* never re-enters the peer engine.
    queueMicrotask(() => {
      if (this.queue[0] === job) {
        this.queue.shift();
        job();
      }
    });
  }

  private receiveControl(message: ControlMessage): void {
    this.onControl?.(message);
  }

  private receiveBinary(buffer: ArrayBuffer): void {
    this.onBinary?.(buffer);
  }

  private flushDrains(): void {
    if (this.bufferedAmount > 0) return;
    const waiters = this.drainWaiters;
    this.drainWaiters = [];
    for (const resolve of waiters) resolve();
  }
}

export function createChannelPair(): { sender: MemoryChannel; receiver: MemoryChannel } {
  const sender = new MemoryChannel();
  const receiver = new MemoryChannel();
  sender.peer = receiver;
  receiver.peer = sender;
  return { sender, receiver };
}

export async function waitFor(
  predicate: () => boolean,
  timeoutMs = 20_000,
  label = 'condition',
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
