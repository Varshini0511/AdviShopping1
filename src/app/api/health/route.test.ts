import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Replace the Supabase client: the test is about how /api/health REPORTS the
// database's state, not about reaching a real one.
const query = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ limit: () => ({ abortSignal: () => query() }) }) }),
  }),
}));

import { GET } from './route';

const req = (ip: string) => new Request('http://localhost/api/health', { headers: { 'x-real-ip': ip } });

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-value';
  process.env.GROQ_API_KEY = 'gsk_secret_value_that_must_not_leak';
  delete process.env.DISABLE_RERANKER;
  delete process.env.DISABLE_VISUAL_SEARCH;
});
afterEach(() => query.mockReset());

describe('GET /api/health', () => {
  it('returns 200 and "ok" when the database answers', async () => {
    query.mockResolvedValue({ error: null });
    const res = await GET(req('10.0.0.1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ status: 'ok', db: 'ok' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 503 so a monitor sees DOWN when the database errors', async () => {
    query.mockResolvedValue({ error: { message: 'connection refused' } });
    const res = await GET(req('10.0.0.2'));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'degraded', db: 'down' });
  });

  it('returns 503 (not a crash) when the lookup throws, e.g. the host no longer resolves', async () => {
    query.mockRejectedValue(new TypeError('fetch failed'));
    const res = await GET(req('10.0.0.3'));
    expect(res.status).toBe(503);
    expect((await res.json()).db).toBe('down');
  });

  it('reports which features are switched on in this deployment', async () => {
    query.mockResolvedValue({ error: null });
    process.env.DISABLE_RERANKER = 'true';
    process.env.DISABLE_VISUAL_SEARCH = 'true';
    const body = await (await GET(req('10.0.0.4'))).json();

    expect(body.features).toEqual({ llm: true, reranker: false, visualSearch: false, documentAI: true });
  });

  it('never leaks keys or connection details', async () => {
    query.mockResolvedValue({ error: null });
    const text = JSON.stringify(await (await GET(req('10.0.0.5'))).json());

    expect(text).not.toContain('gsk_');
    expect(text).not.toContain('anon-key-value');
    expect(text).not.toContain('supabase.co');
  });

  it('is rate limited per client', async () => {
    query.mockResolvedValue({ error: null });
    let last = 200;
    for (let i = 0; i < 31; i++) last = (await GET(req('10.9.9.9'))).status;
    expect(last).toBe(429);
  });
});
