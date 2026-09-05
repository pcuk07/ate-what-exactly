/**
 * Fixed-window rate limiting (design doc §10.5). Vision calls cost real money,
 * so they get their own tighter budget. In-process by design: at 10–100 users
 * one instance is the deployment. Swap the store for Postgres before scaling out.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): RateLimitResult {
    const t = this.now();
    const existing = this.hits.get(key);
    if (!existing || existing.resetAt <= t) {
      const resetAt = t + this.windowMs;
      this.hits.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: this.limit - 1, resetAt };
    }
    if (existing.count >= this.limit) {
      return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    }
    existing.count += 1;
    return { allowed: true, remaining: this.limit - existing.count, resetAt: existing.resetAt };
  }

  /** Drop expired windows so the map doesn't grow without bound. */
  prune(): void {
    const t = this.now();
    for (const [key, v] of this.hits) if (v.resetAt <= t) this.hits.delete(key);
  }

  get size(): number {
    return this.hits.size;
  }
}
