import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { SenderEngine } from '@/lib/transfer/sender.js';
import { ReceiverEngine } from '@/lib/transfer/receiver.js';
import { BlobFileSource } from '@/lib/transfer/fileSource.js';
import { MemorySinkFactory } from '@/lib/transfer/memorySink.js';
import { BUFFER_HIGH_WATER } from '@shared/constants.js';
import type { ReceivedFile, TransferChannel } from '@/lib/transfer/types.js';
import type { SharedFileMeta } from '@shared/protocol.js';
import { createChannelPair, waitFor, MemoryChannel } from '../helpers/memoryChannel.js';

const device = { name: 'Test sender', platform: 'Linux', browser: 'Vitest' };

interface TestFile {
  name: string;
  data: Uint8Array;
  path?: string;
}

function metaFor(file: TestFile, index: number): SharedFileMeta {
  return {
    index,
    name: file.name,
    relativePath: file.path ?? file.name,
    size: file.data.byteLength,
    mime: 'application/octet-stream',
    lastModified: 1_700_000_000_000,
  };
}

interface HarnessOptions {
  chunkSize?: number;
  corrupt?: (frame: ArrayBuffer, frameNumber: number) => ArrayBuffer;
  senderChannel?: MemoryChannel;
  receiverChannel?: MemoryChannel;
}

function setup(files: TestFile[], options: HarnessOptions = {}) {
  const sources = files.map((file, index) => {
    const meta = metaFor(file, index);
    const blob = new Blob([file.data as BlobPart]);
    return new BlobFileSource(blob, meta);
  });
  const pair = createChannelPair();
  const senderChannel = options.senderChannel ?? pair.sender;
  const receiverChannel = options.receiverChannel ?? pair.receiver;
  senderChannel.peer = receiverChannel;
  receiverChannel.peer = senderChannel;

  const received: ReceivedFile[] = [];
  let receiver!: ReceiverEngine;
  let sender!: SenderEngine;

  let frameNumber = 0;
  receiverChannel.onControl = (message) => {
    void receiver.handleControl(message);
  };
  receiverChannel.onBinary = (buffer) => {
    frameNumber += 1;
    const frame = options.corrupt ? options.corrupt(buffer, frameNumber) : buffer;
    void receiver.handleBinary(frame);
  };
  senderChannel.onControl = (message) => {
    void sender.handleControl(message);
  };

  receiver = new ReceiverEngine({
    transferId: 'test-transfer',
    sinkFactory: new MemorySinkFactory(),
    channel: receiverChannel,
    onFileComplete: (file) => received.push(file),
  });
  sender = new SenderEngine({
    sources,
    device,
    channel: senderChannel,
    chunkSize: options.chunkSize ?? 32 * 1024,
    verificationTimeoutMs: 5_000,
    resumeGraceMs: 50,
  });
  sender.start();
  return { sender, receiver, received, senderChannel, receiverChannel };
}

async function bytesOf(file: ReceivedFile): Promise<Buffer> {
  if (!file.blob) throw new Error('Expected an in-memory blob');
  return Buffer.from(await file.blob.arrayBuffer());
}

describe('SenderEngine ↔ ReceiverEngine', () => {
  it('transfers a file byte-for-byte and verifies its SHA-256', async () => {
    const data = randomBytes(200_000);
    const harness = setup([{ name: 'photo.jpg', data }]);
    await waitFor(() => harness.receiver.snapshot.phase === 'review', 5_000, 'file review');
    expect(harness.receiver.snapshot.files[0]?.size).toBe(data.byteLength);

    await harness.receiver.accept();
    await waitFor(() => harness.sender.snapshot.phase === 'completed', 15_000, 'sender completion');
    await waitFor(() => harness.received.length === 1, 5_000, 'received file');

    expect(await bytesOf(harness.received[0]!)).toEqual(data);
    expect(harness.receiver.snapshot.files[0]?.verified).toBe(true);
    expect(harness.receiver.snapshot.files[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(harness.receiver.snapshot.receivedBytes).toBe(data.byteLength);
    expect(harness.sender.snapshot.transferredBytes).toBe(data.byteLength);
  });

  it('handles multiple files, empty files and relative folder paths', async () => {
    const files: TestFile[] = [
      { name: 'empty.txt', data: new Uint8Array(0), path: 'batch/empty.txt' },
      { name: 'notes.txt', data: new Uint8Array(randomBytes(1_237)), path: 'batch/docs/notes.txt' },
      { name: 'clip.mp4', data: new Uint8Array(randomBytes(300_000)), path: 'batch/media/clip.mp4' },
      { name: 'archive.zip', data: new Uint8Array(randomBytes(65_536)), path: 'batch/archive.zip' },
    ];
    const harness = setup(files);
    await waitFor(() => harness.receiver.snapshot.phase === 'review', 5_000, 'file review');
    await harness.receiver.accept();
    await waitFor(() => harness.receiver.snapshot.phase === 'completed', 20_000, 'receiver completion');
    await waitFor(() => harness.received.length === files.length, 5_000, 'all files');

    for (const [index, file] of files.entries()) {
      const received = harness.received.find((entry) => entry.meta.index === index)!;
      expect(received.meta.relativePath).toBe(file.path ?? file.name);
      expect(await bytesOf(received)).toEqual(Buffer.from(file.data));
    }
    expect(harness.receiver.snapshot.files.every((file) => file.verified)).toBe(true);
  });

  it('sanitizes traversal in peer-supplied filenames', async () => {
    const harness = setup([
      { name: '../../etc/passwd', data: new Uint8Array(randomBytes(1_000)), path: '../../etc/passwd' },
    ]);
    await waitFor(() => harness.receiver.snapshot.phase === 'review', 5_000, 'file review');
    const receivedMeta = harness.receiver.snapshot.files[0]!;
    expect(receivedMeta.name).toBe('passwd');
    expect(receivedMeta.relativePath).not.toContain('..');
    await harness.receiver.accept();
    await waitFor(() => harness.received.length === 1, 10_000, 'received file');
  });

  it('detects a corrupted chunk and refuses to finalize the file', async () => {
    const data = randomBytes(250_000);
    let corrupted = false;
    const harness = setup([{ name: 'payload.bin', data }], {
      corrupt: (frame, frameNumber) => {
        if (frameNumber === 3 && !corrupted) {
          corrupted = true;
          const copy = frame.slice(0);
          const view = new Uint8Array(copy);
          view[view.byteLength - 1] ^= 0xff;
          return copy;
        }
        return frame;
      },
    });
    await waitFor(() => harness.receiver.snapshot.phase === 'review', 5_000, 'file review');
    await harness.receiver.accept();
    await waitFor(
      () => harness.receiver.snapshot.phase === 'error' || harness.sender.snapshot.phase === 'error',
      10_000,
      'integrity failure',
    );
    expect(harness.received).toHaveLength(0);
    expect(harness.receiver.snapshot.error?.code).toBe('INTEGRITY');
    expect(harness.sender.snapshot.error).not.toBeNull();
  });

  it('pauses and resumes without losing data', async () => {
    const data = randomBytes(2_000_000);
    const harness = setup([{ name: 'big.bin', data }], { chunkSize: 32 * 1024 });
    await waitFor(() => harness.receiver.snapshot.phase === 'review', 5_000, 'file review');
    await harness.receiver.accept();
    await waitFor(() => harness.sender.snapshot.phase === 'transferring', 5_000, 'transfer start');

    harness.sender.pause();
    await waitFor(() => harness.sender.snapshot.phase === 'paused', 2_000, 'sender paused');
    await waitFor(() => harness.receiver.snapshot.phase === 'paused', 2_000, 'receiver paused');
    await new Promise((resolve) => setTimeout(resolve, 120));
    const pausedAt = harness.receiver.snapshot.receivedBytes;
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(harness.receiver.snapshot.receivedBytes).toBe(pausedAt);
    expect(harness.sender.snapshot.phase).toBe('paused');
    expect(pausedAt).toBeLessThan(data.byteLength);

    harness.sender.resume();
    await waitFor(() => harness.receiver.snapshot.phase === 'completed', 30_000, 'completion after resume');
    expect(await bytesOf(harness.received[0]!)).toEqual(data);
  });

  it('cancels an in-flight transfer on both sides', async () => {
    const harness = setup([{ name: 'huge.iso', data: new Uint8Array(randomBytes(4_000_000)) }], {
      chunkSize: 32 * 1024,
    });
    await waitFor(() => harness.receiver.snapshot.phase === 'review', 5_000, 'file review');
    await harness.receiver.accept();
    await waitFor(() => harness.sender.snapshot.phase === 'transferring', 5_000, 'transfer start');
    harness.sender.pause();
    await waitFor(() => harness.sender.snapshot.phase === 'paused', 5_000, 'sender paused');
    await new Promise((resolve) => setTimeout(resolve, 100));

    await harness.sender.cancel('Test cancel');
    await waitFor(() => harness.receiver.snapshot.phase === 'cancelled', 5_000, 'receiver cancelled');
    expect(harness.sender.snapshot.phase).toBe('cancelled');
    expect(harness.received).toHaveLength(0);
  });

  it('lets the receiver decline the transfer', async () => {
    const harness = setup([{ name: 'declined.txt', data: new Uint8Array(randomBytes(1_024)) }]);
    await waitFor(() => harness.receiver.snapshot.phase === 'review', 5_000, 'file review');
    harness.receiver.reject();
    await waitFor(() => harness.sender.snapshot.phase === 'cancelled', 5_000, 'sender cancellation');
    expect(harness.sender.snapshot.error?.code).toBe('REJECTED');
    expect(harness.receiver.snapshot.phase).toBe('rejected');
  });

  it('resumes from acknowledged offsets after a connection interruption', async () => {
    const data = randomBytes(2_000_000);
    const harness = setup([{ name: 'resume.bin', data }], { chunkSize: 32 * 1024 });
    await waitFor(() => harness.receiver.snapshot.phase === 'review', 5_000, 'file review');
    await harness.receiver.accept();
    await waitFor(() => harness.sender.snapshot.phase === 'transferring', 5_000, 'transfer start');

    // Pause first so the interruption happens at a deterministic point.
    harness.sender.pause();
    await waitFor(() => harness.sender.snapshot.phase === 'paused', 5_000, 'sender paused');
    await new Promise((resolve) => setTimeout(resolve, 120));
    const partial = harness.receiver.snapshot.receivedBytes;
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(data.byteLength);

    harness.senderChannel.close();
    harness.receiverChannel.close();
    harness.sender.interrupt();

    const reconnect = createChannelPair();
    harness.sender.attachChannel(reconnect.sender);
    harness.receiver.attachChannel(reconnect.receiver);
    reconnect.sender.onControl = (message) => {
      void harness.sender.handleControl(message);
    };
    reconnect.receiver.onControl = (message) => {
      void harness.receiver.handleControl(message);
    };
    reconnect.receiver.onBinary = (frame) => {
      void harness.receiver.handleBinary(frame);
    };
    harness.sender.start();

    await waitFor(() => harness.sender.snapshot.phase === 'completed', 40_000, 'resumed completion');
    await waitFor(() => harness.received.length === 1, 5_000, 'resumed file');
    expect(await bytesOf(harness.received[0]!)).toEqual(data);
    expect(harness.receiver.snapshot.receivedBytes).toBe(data.byteLength);
  });

  it('applies backpressure when the channel buffer is saturated', async () => {
    class BlockingChannel extends MemoryChannel {
      blocked = true;
      release: (() => void) | null = null;

      override sendFrame(frame: ArrayBuffer): void {
        super.sendFrame(frame);
        if (this.blocked) this.bufferedAmount = BUFFER_HIGH_WATER * 2;
      }

      override waitForDrain(): Promise<void> {
        if (!this.blocked) return Promise.resolve();
        return new Promise((resolve) => {
          this.release = () => {
            this.blocked = false;
            this.bufferedAmount = 0;
            resolve();
          };
        });
      }
    }

    const data = randomBytes(400_000);
    const pair = createChannelPair();
    const blocking = new BlockingChannel();
    blocking.peer = pair.receiver;
    pair.receiver.peer = blocking;
    const harness = setup([{ name: 'flow.bin', data }], {
      chunkSize: 32 * 1024,
      senderChannel: blocking,
      receiverChannel: pair.receiver,
    });
    await waitFor(() => harness.receiver.snapshot.phase === 'review', 5_000, 'file review');
    await harness.receiver.accept();
    await waitFor(() => blocking.sentFrames.length >= 1, 5_000, 'first frame');
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(blocking.sentFrames.length).toBe(1);
    expect(harness.receiver.snapshot.phase).not.toBe('completed');

    blocking.release?.();
    await waitFor(() => harness.receiver.snapshot.phase === 'completed', 20_000, 'completion');
    expect(await bytesOf(harness.received[0]!)).toEqual(data);
  });

  it('keeps the protocol channel open (no server involvement in bytes)', async () => {
    const harness = setup([{ name: 'single.bin', data: new Uint8Array(randomBytes(80_000)) }]);
    await waitFor(() => harness.receiver.snapshot.phase === 'review', 5_000, 'file review');
    await harness.receiver.accept();
    await waitFor(() => harness.receiver.snapshot.phase === 'completed', 10_000, 'completion');
    const controlTypes = harness.senderChannel.sentControls.map((message) => message.type);
    expect(controlTypes).toContain('hello');
    expect(controlTypes).toContain('meta');
    expect(controlTypes).toContain('file-end');
    expect(controlTypes).toContain('done');
    expect(harness.senderChannel.sentFrames.reduce((sum, bytes) => sum + bytes, 0)).toBeGreaterThan(80_000);
  });
});

describe('TransferChannel contract', () => {
  it('is satisfied by the in-memory test channel', () => {
    const channel: TransferChannel = createChannelPair().sender;
    expect(channel.isOpen).toBe(true);
    expect(channel.bufferedAmount).toBe(0);
  });
});
