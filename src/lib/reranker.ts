// src/lib/reranker.ts
//
// Stage 5 — reranking with a cross-encoder (ms-marco-MiniLM-L-6-v2).
//
// A bi-encoder (the gte-small embeddings used for semantic search) encodes the
// query and each product independently. A cross-encoder instead reads the
// (query, product) PAIR together and scores their relevance directly, which is
// more accurate — but too slow to run over the whole catalog. So we only run it
// over the handful of candidates the earlier stages already shortlisted.
//
// Runs locally — no external API key. First call downloads the model (~80MB).

import {
  AutoTokenizer,
  AutoModelForSequenceClassification,
  type PreTrainedTokenizer,
  type PreTrainedModel,
} from '@xenova/transformers';

const MODEL = 'Xenova/ms-marco-MiniLM-L-6-v2';

let loaderPromise: Promise<{ tokenizer: PreTrainedTokenizer; model: PreTrainedModel }> | null = null;

function getModel() {
  if (!loaderPromise) {
    loaderPromise = (async () => ({
      tokenizer: await AutoTokenizer.from_pretrained(MODEL),
      model: await AutoModelForSequenceClassification.from_pretrained(MODEL),
    }))();
  }
  return loaderPromise;
}

// Scores each item against the query and returns them sorted best-first.
export async function rerank<T extends { text: string }>(
  query: string,
  items: T[]
): Promise<(T & { score: number })[]> {
  if (items.length === 0) return [];
  const { tokenizer, model } = await getModel();

  const scored: (T & { score: number })[] = [];
  for (const item of items) {
    const inputs = tokenizer(query, {
      text_pair: item.text,
      padding: true,
      truncation: true,
    });
    const { logits } = await model(inputs);
    scored.push({ ...item, score: Number((logits.data as Float32Array)[0]) });
  }

  return scored.sort((a, b) => b.score - a.score);
}
