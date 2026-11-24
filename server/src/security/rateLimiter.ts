/**
 * In-memory sliding-window rate limiter.
 *
 * Deliberately dependency-free and clock-injectable so behaviour is unit testable
 * and can later be swapped for a Redis-backed implementation in multi-instance
 * deployments (same interface, see `RateLimiterLike`).
 */
export interface RateResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export interface RateLimiterLike {
  consume(key: string): RateResult;
  reset(key: string): void;
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
  /** Hard cap on tracked keys to bound memory under abuse. */
  maxKeys?: number;
}

export class SlidingWindowRateLimiter implements RateLimiterLike {
  private readonly hits = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly maxKeys: number;

  constructor(options: RateLimiterOptions) {
    if (options.limit <= 0) throw new Error('Rate limit must be positive');
    if (options.windowMs <= 0) throw new Error('Rate window must be positive');
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.now = options.now ?? Date.now;
    this.maxKeys = options.maxKeys ?? 50_000;
  }

  consume(key: string): RateResult {
    const now = this.now();
    const cutoff = now - this.windowMs;
    let timestamps = this.hits.get(key);

    if (!timestamps) {
      if (this.hits.size >= this.maxKeys) this.evictStale(cutoff);
      if (this.hits.size >= this.maxKeys) {
        // Under extreme pressure, deny new keys rather than growing without bound.
        return { allowed: false, remaining: 0, retryAfterMs: this.windowMs };
      }
      timestamps = [];
      this.hits.set(key, timestamps);
    }

    while (timestamps.length > 0 && timestamps[0]! <= cutoff) timestamps.shift();

    if (timestamps.length >= this.limit) {
      const oldest = timestamps[0]!;
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(1, oldest + this.windowMs - now),
      };
    }

    timestamps.push(now);
    return { allowed: true, remaining: this.limit - timestamps.length, retryAfterMs: 0 };
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private evictStale(cutoff: number): void {
    for (const [key, timestamps] of this.hits) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1]! <= cutoff) {
        this.hits.delete(key);
      }
    }
  }
}

/** Best-effort client address for socket/HTTP rate limiting behind a trusted proxy. */
export function clientKey(value: string | undefined | null): string {
  if (!value) return 'unknown';
  return value.replace(/^::ffff:/, '');
}
