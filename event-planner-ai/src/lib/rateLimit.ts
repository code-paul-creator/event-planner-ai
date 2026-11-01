export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  maxKeys?: number;
  now?: () => number;
}

/**
 * Fixed-window, in-memory limiter. Good protection against a single client
 * hammering the endpoint (and burning your Gemini quota) within one warm
 * serverless instance. Instances don't share memory, so for strict global
 * limits add Vercel's WAF rate limiting or Upstash Redis (see README).
 */
export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 10_000,
  now = Date.now,
}: RateLimiterOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  function prune(current: number) {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= current) hits.delete(key);
    }
    // Hard cap so a flood of unique keys can't grow memory without bound.
    while (hits.size > maxKeys) {
      const oldest = hits.keys().next().value;
      if (oldest === undefined) break;
      hits.delete(oldest);
    }
  }

  return {
    check(key: string): RateLimitResult {
      const current = now();
      if (hits.size >= maxKeys) prune(current);

      let entry = hits.get(key);
      if (!entry || entry.resetAt <= current) {
        entry = { count: 0, resetAt: current + windowMs };
        hits.set(key, entry);
      }
      entry.count += 1;

      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - current) / 1000));
      return {
        allowed: entry.count <= limit,
        remaining: Math.max(0, limit - entry.count),
        retryAfterSec,
      };
    },
  };
}
