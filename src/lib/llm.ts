// src/lib/llm.ts
//
// Stage 6 — LLM conversation with Groq.
//
// Groq is a fast inference provider serving open models (Llama, etc.) over an
// OpenAI-compatible API. Takes the reranked top products and asks the model to
// write a short shopping-assistant recommendation plus a one-line reason per
// product.
//
// Config in .env.local:
//   GROQ_API_KEY=gsk_...                 (required to enable this stage)
//   GROQ_MODEL=qwen/qwen3.8-27b          (optional; this is the default)
//
// If GROQ_API_KEY is absent the pipeline still works — this returns
// { enabled: false } and the app falls back to keyword-overlap reasons.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Groq retires models without much notice — override via GROQ_MODEL if this
// one starts returning 404 model_not_found.
const DEFAULT_MODEL = 'qwen/qwen3.8-27b';

export type RankingReason = { id: number; why: string };

export type LlmResult = {
  enabled: boolean;
  summary: string;
  ranking: RankingReason[];
};

type ProductForLlm = { id: number; name: string; description: string };

export async function converse(
  query: string,
  products: ProductForLlm[]
): Promise<LlmResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return { enabled: false, summary: '', ranking: [] };
  }

  const list = products
    .map((p, i) => `${i + 1}. [id ${p.id}] ${p.name} — ${p.description}`)
    .join('\n');

  const prompt = `You are a friendly shopping assistant for an online store called AdviShopping.
A customer searched for: "${query}".

These products were retrieved and ranked as the best matches:
${list}

Write a short, warm recommendation (2-3 sentences) helping the customer choose, then give a one-sentence reason for each product explaining why it matches their search.

Respond with ONLY valid JSON in exactly this shape:
{"summary": "<2-3 sentence recommendation>", "ranking": [{"id": <product id>, "why": "<one sentence>"}]}
Include every product id from the list in "ranking", keeping the given order.`;

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        max_tokens: 1024,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      console.error('Groq stage failed:', res.status, await res.text());
      return { enabled: false, summary: '', ranking: [] };
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = (data.choices?.[0]?.message?.content ?? '').trim();

    // json_object mode returns clean JSON, but parse defensively anyway.
    const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(json) as { summary?: string; ranking?: RankingReason[] };

    return {
      enabled: true,
      summary: parsed.summary ?? '',
      ranking: Array.isArray(parsed.ranking) ? parsed.ranking : [],
    };
  } catch (err) {
    console.error('Groq stage failed:', err);
    return { enabled: false, summary: '', ranking: [] };
  }
}
