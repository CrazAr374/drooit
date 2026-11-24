import { describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { Sha256, sha256Hex, toHex } from '@shared/sha256';

function nodeHash(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

describe('Sha256', () => {
  it('matches the FIPS 180-4 test vectors', () => {
    expect(sha256Hex(new Uint8Array())).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(
      sha256Hex(
        new TextEncoder().encode(
          'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
        ),
      ),
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  it('matches node:crypto across boundary sizes', () => {
    for (const size of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 255, 1024, 65_537]) {
      const data = randomBytes(size);
      const input = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      expect(sha256Hex(input)).toBe(nodeHash(input));
    }
  });

  it('matches node:crypto for one megabyte fed in irregular pieces', () => {
    const data = new Uint8Array(randomBytes(1024 * 1024 + 137));
    const expected = nodeHash(data);
    const hasher = new Sha256();
    let offset = 0;
    let step = 1;
    while (offset < data.length) {
      const end = Math.min(offset + step, data.length);
      hasher.update(data.subarray(offset, end));
      offset = end;
      step = (step * 7 + 13) % 97 + 1;
    }
    expect(hasher.digestHex()).toBe(expected);
  });

  it('rejects reuse after finalisation', () => {
    const hasher = new Sha256();
    hasher.update(new Uint8Array([1, 2, 3]));
    hasher.digest();
    expect(() => hasher.digest()).toThrow();
    expect(() => hasher.update(new Uint8Array([4]))).toThrow();
  });

  it('encodes hex without padding mistakes', () => {
    expect(toHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe('00010f10ff');
  });
});
