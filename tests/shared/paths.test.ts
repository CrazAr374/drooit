import { describe, expect, it } from 'vitest';
import {
  extensionOf,
  pathSegments,
  sanitizeFilename,
  sanitizeRelativePath,
} from '../../shared/paths.js';
import { formatBytes, formatCountdown, formatEta, formatPercent, formatSpeed, pluralize } from '../../shared/format.js';

describe('sanitizeFilename', () => {
  it('keeps ordinary names intact', () => {
    expect(sanitizeFilename('holiday photo.jpg')).toBe('holiday photo.jpg');
    expect(sanitizeFilename('résumé.pdf')).toBe('résumé.pdf');
  });

  it('strips directory components and traversal', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\me\\secret.txt')).toBe('secret.txt');
    expect(sanitizeFilename('folder/sub/file.txt')).toBe('file.txt');
    expect(sanitizeFilename('..')).toBe('file');
    expect(sanitizeFilename('')).toBe('file');
  });

  it('neutralises control and reserved characters', () => {
    expect(sanitizeFilename('a\u0000b\u001fc.txt')).toBe('abc.txt');
    expect(sanitizeFilename('what?.txt')).toBe('what_.txt');
    expect(sanitizeFilename('a<b>c|d"e*f.txt')).toBe('a_b_c_d_e_f.txt');
  });

  it('escapes Windows reserved device names', () => {
    expect(sanitizeFilename('CON')).toBe('_CON');
    expect(sanitizeFilename('lpt1.txt')).toBe('_lpt1.txt');
    expect(sanitizeFilename('console.txt')).toBe('console.txt');
  });

  it('trims edge dots and whitespace but keeps a sensible extension', () => {
    expect(sanitizeFilename('  report.pdf  ')).toBe('report.pdf');
    expect(sanitizeFilename('.hidden')).toBe('hidden');
  });

  it('caps very long names while preserving the extension', () => {
    const name = `${'a'.repeat(300)}.png`;
    const result = sanitizeFilename(name);
    expect(result.length).toBeLessThanOrEqual(180);
    expect(result.endsWith('.png')).toBe(true);
  });
});

describe('sanitizeRelativePath', () => {
  it('normalises separators and keeps safe folders', () => {
    expect(sanitizeRelativePath('album\\2024\\photo.jpg')).toBe('album/2024/photo.jpg');
  });

  it('drops traversal, dot segments, drive letters and absolute prefixes', () => {
    expect(sanitizeRelativePath('../../etc/passwd')).toBe('etc/passwd');
    expect(sanitizeRelativePath('/absolute/path/file.txt')).toBe('absolute/path/file.txt');
    expect(sanitizeRelativePath('C:\\Users\\me\\file.txt')).toBe('Users/me/file.txt');
    expect(sanitizeRelativePath('./a/./b/../c.txt')).toBe('a/b/c.txt');
  });

  it('falls back to the sanitized filename when nothing survives', () => {
    expect(sanitizeRelativePath('..', 'report.pdf')).toBe('report.pdf');
    expect(sanitizeRelativePath('', 'report.pdf')).toBe('report.pdf');
    expect(sanitizeRelativePath('///')).toBe('file');
  });

  it('limits depth and total length', () => {
    const deep = Array.from({ length: 30 }, (_, index) => `dir${index}`).join('/');
    expect(sanitizeRelativePath(`${deep}/file.txt`).split('/').length).toBeLessThanOrEqual(16);

    const longSegments = Array.from({ length: 10 }, () => 'x'.repeat(120)).join('/');
    expect(sanitizeRelativePath(`${longSegments}/file.txt`).length).toBeLessThanOrEqual(512);
  });
});

describe('path helpers', () => {
  it('splits paths and reads extensions', () => {
    expect(pathSegments('a/b/c.txt')).toEqual(['a', 'b', 'c.txt']);
    expect(pathSegments('')).toEqual([]);
    expect(extensionOf('archive.tar.gz')).toBe('gz');
    expect(extensionOf('README')).toBe('');
    expect(extensionOf('.env')).toBe('');
    expect(extensionOf('trailing.')).toBe('');
  });
});

describe('formatting', () => {
  it('formats byte counts', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 ** 2 * 250)).toBe('250 MB');
    expect(formatBytes(Number.NaN)).toBe('0 B');
  });

  it('formats speeds, ETAs, countdowns and percentages', () => {
    expect(formatSpeed(0)).toBe('0 KB/s');
    expect(formatSpeed(2048)).toBe('2.0 KB/s');
    expect(formatEta(30)).toBe('30s');
    expect(formatEta(90)).toBe('1m 30s');
    expect(formatEta(3600 + 120)).toBe('1h 2m');
    expect(formatEta(0)).toBe('—');
    expect(formatCountdown(65_000)).toBe('1:05');
    expect(formatCountdown(-5)).toBe('0:00');
    expect(formatPercent(42.44)).toBe('42%');
    expect(formatPercent(4.2)).toBe('4.2%');
    expect(formatPercent(150)).toBe('100%');
    expect(pluralize(1, 'file')).toBe('1 file');
    expect(pluralize(3, 'file')).toBe('3 files');
    expect(pluralize(2, 'device', 'devices')).toBe('2 devices');
  });
});
