import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildIceServers, type AppConfig } from '../../server/src/config.js';
import { createOriginValidator, normalizeOrigin } from '../../server/src/security/origin.js';
import { SlidingWindowRateLimiter, clientKey } from '../../server/src/security/rateLimiter.js';

const baseTurnConfig: Pick<
  AppConfig,
  'stunUrls' | 'turnUrls' | 'turnSecret' | 'turnUsername' | 'turnPassword' | 'turnTtlSeconds'
> = {
  stunUrls: ['stun:stun.example.org:3478'],
  turnUrls: [],
  turnSecret: '',
  turnUsername: '',
  turnPassword: '',
  turnTtlSeconds: 3600,
};

describe('buildIceServers', () => {
  it('returns STUN servers and reports TURN disabled', () => {
    const { iceServers, turnEnabled } = buildIceServers(baseTurnConfig);
    expect(turnEnabled).toBe(false);
    expect(iceServers).toEqual([{ urls: ['stun:stun.example.org:3478'] }]);
  });

  it('derives time-limited coturn credentials from the shared secret', () => {
    const now = 1_700_000_000_000;
    const secret = 'super-secret-turn-key';
    const { iceServers, turnEnabled } = buildIceServers(
      { ...baseTurnConfig, turnUrls: ['turn:turn.example.org:3478'], turnSecret: secret },
      now,
    );
    expect(turnEnabled).toBe(true);
    expect(iceServers).toHaveLength(2);

    const turn = iceServers[1]!;
    const expectedExpiry = Math.floor(now / 1000) + 3600;
    const expectedUsername = `${expectedExpiry}:drooit`;
    expect(turn.username).toBe(expectedUsername);
    expect(turn.credential).toBe(
      createHmac('sha1', secret).update(expectedUsername).digest('base64'),
    );
  });

  it('supports static TURN username/password when no secret is set', () => {
    const { iceServers, turnEnabled } = buildIceServers({
      ...baseTurnConfig,
      turnUrls: ['turns:turn.example.org:5349'],
      turnUsername: 'user',
      turnPassword: 'pass',
    });
    expect(turnEnabled).toBe(true);
    expect(iceServers[1]).toEqual({
      urls: ['turns:turn.example.org:5349'],
      username: 'user',
      credential: 'pass',
    });
  });

  it('does not advertise TURN without complete credentials', () => {
    const { iceServers, turnEnabled } = buildIceServers({
      ...baseTurnConfig,
      turnUrls: ['turn:turn.example.org:3478'],
      turnUsername: 'user',
    });
    expect(turnEnabled).toBe(false);
    expect(iceServers).toHaveLength(1);
  });
});

describe('origin validation', () => {
  it('normalises origins and rejects non-http protocols', () => {
    expect(normalizeOrigin('https://Example.com/path?q=1')).toBe('https://example.com');
    expect(normalizeOrigin('http://localhost:5173/')).toBe('http://localhost:5173');
    expect(normalizeOrigin('ftp://example.com')).toBeNull();
    expect(normalizeOrigin('not a url')).toBeNull();
  });

  it('allows configured origins in production and rejects everything else', () => {
    const validator = createOriginValidator(['https://drooit.example'], { isProduction: true });
    expect(validator.isAllowed('https://drooit.example')).toBe(true);
    expect(validator.isAllowed('https://drooit.example/')).toBe(true);
    expect(validator.isAllowed('https://evil.example')).toBe(false);
    expect(validator.isAllowed(undefined)).toBe(false);
    expect(validator.isAllowed('not-a-url')).toBe(false);
  });

  it('allows a missing origin outside production and wildcard only outside production', () => {
    const dev = createOriginValidator(['*'], { isProduction: false });
    expect(dev.isAllowed(undefined)).toBe(true);
    expect(dev.isAllowed('https://anything.example')).toBe(true);

    const prod = createOriginValidator(['*'], { isProduction: true });
    expect(prod.isAllowed('https://anything.example')).toBe(false);
    expect(prod.isAllowed(undefined)).toBe(false);
  });

  it('honours an explicit allowMissingOrigin override', () => {
    const validator = createOriginValidator(['https://drooit.example'], {
      isProduction: true,
      allowMissingOrigin: true,
    });
    expect(validator.isAllowed(undefined)).toBe(true);
  });

  it('automatically permits drooit vercel production and preview origins', () => {
    const validator = createOriginValidator(['https://drooit.example'], { isProduction: true });
    expect(validator.isAllowed('https://drooit.vercel.app')).toBe(true);
    expect(validator.isAllowed('https://drooit-preview-abc.vercel.app')).toBe(true);
    expect(validator.isAllowed('https://drooit-git-main-crazar374s-projects.vercel.app')).toBe(true);
    expect(validator.isAllowed('https://attacker.vercel.app')).toBe(false);
    expect(validator.isAllowed('http://drooit.vercel.app')).toBe(false); // non-TLS rejected
  });
});

describe('SlidingWindowRateLimiter', () => {
  it('permits up to the limit and then rejects with a retry hint', () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter({ limit: 3, windowMs: 1000, now: () => now });

    expect(limiter.consume('a')).toMatchObject({ allowed: true, remaining: 2 });
    expect(limiter.consume('a')).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.consume('a')).toMatchObject({ allowed: true, remaining: 0 });
    const rejected = limiter.consume('a');
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterMs).toBe(1000);

    now = 400;
    expect(limiter.consume('a').retryAfterMs).toBe(600);
  });

  it('tracks keys independently and frees them after the window', () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter({ limit: 1, windowMs: 1000, now: () => now });
    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('b').allowed).toBe(true);
    expect(limiter.consume('a').allowed).toBe(false);

    now = 1001;
    expect(limiter.consume('a').allowed).toBe(true);
  });

  it('supports explicit resets and rejects invalid configuration', () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter({ limit: 1, windowMs: 1000, now: () => now });
    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('a').allowed).toBe(false);
    limiter.reset('a');
    expect(limiter.consume('a').allowed).toBe(true);

    expect(() => new SlidingWindowRateLimiter({ limit: 0, windowMs: 1000 })).toThrow();
    expect(() => new SlidingWindowRateLimiter({ limit: 1, windowMs: 0 })).toThrow();
  });

  it('bounds memory by evicting stale keys under pressure', () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter({ limit: 5, windowMs: 100, maxKeys: 2, now: () => now });
    expect(limiter.consume('a').allowed).toBe(true);
    expect(limiter.consume('b').allowed).toBe(true);
    // New key while at capacity with live entries is denied rather than unbounded.
    expect(limiter.consume('c').allowed).toBe(false);

    now = 200;
    // All entries are stale and get evicted, making room for the new key.
    expect(limiter.consume('c').allowed).toBe(true);
  });

  it('normalises IPv4-mapped addresses', () => {
    expect(clientKey('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(clientKey('127.0.0.1')).toBe('127.0.0.1');
    expect(clientKey(undefined)).toBe('unknown');
  });
});
