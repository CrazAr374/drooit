/**
 * Rolling-window throughput meter. Samples are pruned to the window, so a stalled
 * transfer decays to 0 B/s instead of reporting a stale average.
 */
export class SpeedMeter {
  private samples: Array<{ at: number; bytes: number }> = [];

  constructor(
    private readonly windowMs = 3_000,
    private readonly now: () => number = Date.now,
  ) {}

  record(bytes: number, at = this.now()): void {
    if (bytes <= 0) return;
    this.samples.push({ at, bytes });
    this.prune(at);
  }

  rate(at = this.now()): number {
    this.prune(at);
    if (this.samples.length === 0) return 0;
    const total = this.samples.reduce((sum, sample) => sum + sample.bytes, 0);
    const oldest = this.samples[0]!.at;
    const spanMs = Math.max(250, at - oldest);
    return (total / spanMs) * 1000;
  }

  etaSeconds(remainingBytes: number, at = this.now()): number {
    const rate = this.rate(at);
    if (remainingBytes <= 0) return 0;
    if (rate <= 1) return Number.POSITIVE_INFINITY;
    return remainingBytes / rate;
  }

  reset(): void {
    this.samples = [];
  }

  private prune(at: number): void {
    const cutoff = at - this.windowMs;
    let index = 0;
    while (index < this.samples.length && this.samples[index]!.at < cutoff) index += 1;
    if (index > 0) this.samples.splice(0, index);
  }
}
