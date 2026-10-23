import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clientIp, rateLimit, tooManyRequests } from './rate-limit';

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('allows up to the limit, then blocks with a retry hint', () => {
    for (let i = 0; i < 3; i++) expect(rateLimit('t:a', 3, 60_000).ok).toBe(true);
    const blocked = rateLimit('t:a', 3, 60_000);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it('keeps separate budgets per key', () => {
    for (let i = 0; i < 2; i++) rateLimit('t:b', 2, 60_000);
    expect(rateLimit('t:b', 2, 60_000).ok).toBe(false);
    expect(rateLimit('t:c', 2, 60_000).ok).toBe(true);
  });

  it('resets after the window passes', () => {
    for (let i = 0; i < 2; i++) rateLimit('t:d', 2, 60_000);
    expect(rateLimit('t:d', 2, 60_000).ok).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(rateLimit('t:d', 2, 60_000).ok).toBe(true);
  });
});

describe('clientIp', () => {
  const req = (headers: Record<string, string>) => new Request('http://localhost/', { headers });

  it('prefers the CDN header, then x-real-ip, then the first forwarded address', () => {
    expect(clientIp(req({ 'cf-connecting-ip': '1.1.1.1', 'x-real-ip': '2.2.2.2' }))).toBe('1.1.1.1');
    expect(clientIp(req({ 'x-real-ip': '2.2.2.2' }))).toBe('2.2.2.2');
    expect(clientIp(req({ 'x-forwarded-for': '3.3.3.3, 10.0.0.1' }))).toBe('3.3.3.3');
    expect(clientIp(req({}))).toBe('unknown');
  });
});

describe('tooManyRequests', () => {
  it('returns a 429 with a Retry-After header the UI can show', async () => {
    const res = tooManyRequests(42);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    expect((await res.json()).error).toMatch(/42s/);
  });
});
