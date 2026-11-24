import { describe, expect, it } from 'vitest';
import {
  CHUNK_HEADER_BYTES,
  decodeChunkFrame,
  encodeChunkFrame,
  encodeControlMessage,
  isProtocolCompatible,
  parseControlMessage,
  toSharedFileMeta,
} from '../../shared/protocol.js';
import { MAX_CHUNK_SIZE, PROTOCOL_VERSION } from '../../shared/constants.js';

describe('binary chunk framing', () => {
  it('round-trips file index, chunk index and payload', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5, 250, 0, 255]);
    const frame = encodeChunkFrame(7, 42, payload);
    expect(frame.byteLength).toBe(CHUNK_HEADER_BYTES + payload.byteLength);

    const decoded = decodeChunkFrame(frame);
    expect(decoded.fileIndex).toBe(7);
    expect(decoded.chunkIndex).toBe(42);
    expect(decoded.flags).toBe(0);
    expect([...decoded.payload]).toEqual([...payload]);
  });

  it('handles an empty payload and the maximum chunk size', () => {
    const empty = decodeChunkFrame(encodeChunkFrame(0, 0, new Uint8Array(0)));
    expect(empty.payload.byteLength).toBe(0);

    const max = new Uint8Array(MAX_CHUNK_SIZE);
    max[0] = 9;
    max[MAX_CHUNK_SIZE - 1] = 7;
    const decoded = decodeChunkFrame(encodeChunkFrame(1, 2, max));
    expect(decoded.payload.byteLength).toBe(MAX_CHUNK_SIZE);
    expect(decoded.payload[0]).toBe(9);
    expect(decoded.payload[MAX_CHUNK_SIZE - 1]).toBe(7);
  });

  it('rejects out-of-range headers and malformed frames', () => {
    expect(() => encodeChunkFrame(-1, 0, new Uint8Array(1))).toThrow(RangeError);
    expect(() => encodeChunkFrame(0x10000, 0, new Uint8Array(1))).toThrow(RangeError);
    expect(() => encodeChunkFrame(0, -1, new Uint8Array(1))).toThrow(RangeError);
    expect(() => encodeChunkFrame(0, 0, new Uint8Array(MAX_CHUNK_SIZE + 1))).toThrow(RangeError);

    expect(() => decodeChunkFrame(new ArrayBuffer(CHUNK_HEADER_BYTES - 1))).toThrow(RangeError);

    const bad = encodeChunkFrame(0, 0, new Uint8Array(4));
    new DataView(bad).setUint32(8, 400, true);
    expect(() => decodeChunkFrame(bad)).toThrow(/payload length/);
  });
});

describe('control messages', () => {
  const hello = {
    type: 'hello' as const,
    protocolVersion: PROTOCOL_VERSION,
    sender: { name: 'Laptop', platform: 'Windows', browser: 'Chrome' },
    fileCount: 1,
    totalBytes: 10,
  };

  it('encodes and parses a valid message', () => {
    const parsed = parseControlMessage(encodeControlMessage(hello));
    expect(parsed).toEqual({ ok: true, message: hello });
  });

  it('rejects non-strings, invalid JSON and schema violations without throwing', () => {
    expect(parseControlMessage(undefined).ok).toBe(false);
    expect(parseControlMessage('').ok).toBe(false);
    expect(parseControlMessage('{not json').ok).toBe(false);
    expect(parseControlMessage(JSON.stringify({ type: 'hello' })).ok).toBe(false);
    expect(parseControlMessage(JSON.stringify({ type: 'nope' })).ok).toBe(false);
    expect(parseControlMessage(JSON.stringify({ ...hello, protocolVersion: 0 })).ok).toBe(false);
    expect(parseControlMessage(JSON.stringify({ ...hello, totalBytes: -1 })).ok).toBe(false);
    expect(parseControlMessage('x'.repeat(1_000_001)).ok).toBe(false);
  });

  it('validates file-begin, restart and resume-state payloads', () => {
    expect(
      parseControlMessage(
        JSON.stringify({ type: 'file-begin', fileIndex: 0, startByte: 1024, chunkSize: 262144 }),
      ).ok,
    ).toBe(true);
    expect(
      parseControlMessage(JSON.stringify({ type: 'file-begin', fileIndex: 0, startByte: 0, chunkSize: 0 })).ok,
    ).toBe(false);
    expect(parseControlMessage(JSON.stringify({ type: 'restart' })).ok).toBe(true);
    expect(
      parseControlMessage(
        JSON.stringify({
          type: 'resume-state',
          files: [{ fileIndex: 0, receivedBytes: 5, complete: false }],
        }),
      ).ok,
    ).toBe(true);
  });

  it('checks protocol compatibility by exact version', () => {
    expect(isProtocolCompatible(PROTOCOL_VERSION)).toBe(true);
    expect(isProtocolCompatible(PROTOCOL_VERSION + 1)).toBe(false);
  });
});

describe('file metadata', () => {
  it('preserves webkitRelativePath for folder uploads', () => {
    const meta = toSharedFileMeta(
      {
        name: 'photo.jpg',
        size: 10,
        type: 'image/jpeg',
        lastModified: 1,
        webkitRelativePath: 'album/2024/photo.jpg',
      },
      3,
    );
    expect(meta).toMatchObject({
      index: 3,
      name: 'photo.jpg',
      relativePath: 'album/2024/photo.jpg',
      mime: 'image/jpeg',
    });
  });

  it('encodes and parses chat text and voice messages', () => {
    const textMsg = {
      type: 'chat:message' as const,
      id: 'msg-1',
      senderPeerId: 'peer-abc',
      senderName: 'Atharva Laptop',
      timestamp: 1700000000,
      content: 'Hey, sending the project folders!',
      folderRef: '/Design',
    };
    const parsedText = parseControlMessage(encodeControlMessage(textMsg));
    expect(parsedText.ok).toBe(true);
    if (parsedText.ok) {
      expect(parsedText.message).toEqual(textMsg);
    }

    const voiceMsg = {
      type: 'chat:voice' as const,
      id: 'voice-1',
      senderPeerId: 'peer-abc',
      senderName: 'Atharva Laptop',
      timestamp: 1700000001,
      durationSeconds: 12.5,
      mime: 'audio/webm;codecs=opus',
      audioPayloadBase64: 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAA==',
    };
    const parsedVoice = parseControlMessage(encodeControlMessage(voiceMsg));
    expect(parsedVoice.ok).toBe(true);
    if (parsedVoice.ok) {
      expect(parsedVoice.message).toEqual(voiceMsg);
    }
  });

  it('falls back to the filename and a generic MIME type', () => {
    const meta = toSharedFileMeta(
      { name: 'archive.zip', size: 0, type: '', lastModified: 0 },
      0,
    );
    expect(meta.relativePath).toBe('archive.zip');
    expect(meta.mime).toBe('application/octet-stream');
  });
});
