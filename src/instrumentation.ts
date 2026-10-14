// src/instrumentation.ts
//
// Runs once when the Next.js server process starts. We use it to start loading
// the text-embedding model in the background, so the first visitor's search
// doesn't also pay the model-load cost (15–40s cold) on top of the request.
//
// On a host that sleeps when idle (e.g. Render's free tier) this overlaps the
// model load with the container's own wake-up instead of running after it.
//
// The model is already lazily loaded + cached in src/lib/embeddings.ts; this
// just triggers that same path early. Failures are non-fatal — the first real
// search will simply load it on demand as before.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const { generateEmbedding } = await import('./lib/embeddings');
  void generateEmbedding('warm up').catch((err) => {
    console.warn('[warmup] embedding model preload failed (will load on first search):', err);
  });
}
