/**
 * Fixed-window counters in memory: enough for one server instance (the Render deployment).
 * Behind several instances, move these counts to Postgres or Redis.
 */
const g = globalThis as unknown as { __mpLimits?: Map<string, { count: number; resetAt: number }> };
const buckets = (g.__mpLimits ??= new Map());

export interface Limit {
  max: number;
  windowMs: number;
}

export const LIMITS = {
  /** Wrong passwords for one email from one address */
  loginPerAccount: { max: 5, windowMs: 15 * 60_000 },
  /** Wrong passwords from one address, any email */
  loginPerIp: { max: 30, windowMs: 15 * 60_000 },
  signupPerIp: { max: 10, windowMs: 60 * 60_000 },
  resetPerIp: { max: 5, windowMs: 60 * 60_000 },
} satisfies Record<string, Limit>;

/** Seconds until the key may try again, or 0 if it's allowed now. */
export function blockedFor(key: string, limit: Limit, now = Date.now()): number {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now || b.count < limit.max) return 0;
  return Math.ceil((b.resetAt - now) / 1000);
}

export function hit(key: string, limit: Limit, now = Date.now()): void {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) buckets.set(key, { count: 1, resetAt: now + limit.windowMs });
  else b.count++;
  // Keep memory bounded: drop expired buckets now and then.
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}

export function clear(key: string): void {
  buckets.delete(key);
}
