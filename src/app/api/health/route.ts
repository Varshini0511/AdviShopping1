// src/app/api/health/route.ts
//
// GET → { status, db, features, ... }
//
// For uptime monitors (e.g. UptimeRobot, a free 5-minute ping that also keeps a
// sleeping free-tier host warm) and for a quick human check of what is switched
// on. It returns HTTP 503 when the database is unreachable so a monitor treats
// that as DOWN — an ordinary page returns 200 even with an empty catalog.
//
// It exposes booleans only: no keys, URLs or versions.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DB_TIMEOUT_MS = 5_000;
const REQUESTS_PER_MINUTE = 30;

export async function GET(request: Request) {
  const limited = rateLimit(`health:${clientIp(request)}`, REQUESTS_PER_MINUTE, 60_000);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);

  const started = Date.now();
  let dbOk = false;
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    // Reading one row proves DNS, TLS, the API gateway and the database all work.
    const { error } = await supabase.from('products').select('id').limit(1).abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
    dbOk = !error;
  } catch {
    dbOk = false;
  }

  const body = {
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'ok' : 'down',
    // What is switched on in THIS deployment (some are off on small hosts).
    features: {
      llm: Boolean(process.env.GROQ_API_KEY),
      reranker: process.env.DISABLE_RERANKER !== 'true',
      visualSearch: process.env.DISABLE_VISUAL_SEARCH !== 'true',
      documentAI: Boolean(process.env.GROQ_API_KEY),
    },
    latencyMs: Date.now() - started,
    uptimeSeconds: Math.round(process.uptime()),
  };

  return NextResponse.json(body, {
    status: dbOk ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
