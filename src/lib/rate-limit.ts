// src/lib/rate-limit.ts
//
// A tiny in-memory fixed-window rate limiter, keyed by client IP.
//
// Why it exists: /api/chat spends Groq quota and /api/image-search runs a
// ~150 MB model, and neither requires a login — so without a limit anyone can
// loop them and burn the quota or the host's CPU.
//
// Trade-offs (deliberate, for a single-instance deployment):
//   - State lives in this process's memory: it resets on restart/redeploy and
//     is NOT shared across multiple instances. For a multi-instance deployment
//     use a shared store (Redis / Upstash) instead.
//   - The client IP comes from proxy headers, which a determined attacker may
//     be able to spoof. That's acceptable here: this is cost protection for a
//     demo, not an authentication mechanism.

import { NextResponse } from 'next/server';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 50_000; // hard ceiling so spoofed IPs can't grow the map forever
let lastSweep = 0;

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

/** Allow at most `limit` calls per `windowMs` for `key`. */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // Drop expired buckets at most once a minute.
  if (now - lastSweep > 60_000 || buckets.size > MAX_KEYS) {
    lastSweep = now;
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    if (buckets.size > MAX_KEYS) buckets.clear();
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { ok: true };
}

/** Best-effort client IP from the headers a reverse proxy sets. */
export function clientIp(request: Request): string {
  const h = request.headers;
  return (
    h.get('cf-connecting-ip') ||
    h.get('x-real-ip') ||
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

/** A 429 the UI can show as-is (every client reads `error`). */
export function tooManyRequests(retryAfterSec: number) {
  return NextResponse.json(
    { error: `You're sending requests too quickly. Please try again in ${retryAfterSec}s.` },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
  );
}
