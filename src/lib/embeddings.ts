// src/lib/embeddings.ts
//
// Server-side query embedding using gte-small (384 dims) — the same model
// used to embed the products in scripts/generate-embeddings.mjs, so the
// vectors live in the same space. No external API key required.
//
// The model is loaded lazily and cached for the lifetime of the server
// process (first call is slow while the model loads/downloads).

import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'Supabase/gte-small');
  }
  return extractorPromise;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}
