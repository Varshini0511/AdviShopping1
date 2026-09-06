// src/app/api/chat/route.ts
//
// Conversational shopping agent. This is an AGENTIC LOOP: the LLM (Groq) can
// call named tools (search_products, add_to_cart, ...) instead of just
// producing text. We execute the real action, feed the result back, and let
// the model decide the next step — repeating until it has a final answer.
//
// The model NEVER touches the database directly (grounding): every action a
// user sees claimed ("added to your cart") corresponds to a tool call that
// really ran, so the agent can't hallucinate having done something it didn't.

import { NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { TOOLS, executeTool } from '@/lib/chat-tools';

export const runtime = 'nodejs';
export const maxDuration = 60;

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const MAX_STEPS = 5; // hard cap on the agent loop so a confused model can't spin forever

const SYSTEM_PROMPT = `You are the AdviShopping shopping assistant, embedded in the store's chat widget.
You can search the catalog and manage the user's cart, wishlist, and saved-for-later list using the
provided tools — you cannot do anything the tools don't support, and you must not claim an action
succeeded unless a tool call actually reported success.

Rules:
- Call search_products AT MOST ONCE per user request. Never call it again after it has returned results —
  reuse the product_id(s) from that one call for the rest of this turn.
- If the user is just browsing/searching (no add/buy/save/wishlist verb), your final reply must name the
  specific product(s) found (with price), then STOP — do not call any more tools.
- If the user explicitly asked to add/buy/save/wishlist something, call search_products once, then
  immediately call the matching tool (add_to_cart / add_to_wishlist / save_for_later) using the best-matching
  product_id from those results, then report what you did in your final reply. Do not search again first.
- If the user says "buy" or "purchase", this store has no payment processing — call add_to_cart and tell
  them to review it at checkout. Never claim a purchase was completed.
- If a tool reports the user is not logged in, tell them to log in — don't pretend it worked.
- CRITICAL: only mention product names and prices that appear EXACTLY in a tool result you received in
  this conversation. Never mention a brand, model, or price from your own general knowledge — this store's
  catalog is small and specific, and inventing a plausible-sounding product is strictly forbidden. If a
  search found nothing relevant, say so plainly.
- Keep replies short and conversational (1-3 sentences), like a helpful in-store assistant.`;

type ChatMessage = { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; tool_call_id?: string; tool_calls?: unknown };
type SearchedProduct = { id: number; name: string; price: number | null };

// Grounding guardrail: LLMs (even well-prompted ones) sometimes invent a
// plausible-sounding product/price instead of using the real tool result.
// Rather than trust the prompt alone, we verify every price the model states
// against the real numbers search_products actually returned this turn, and
// replace the reply with a deterministic one built from real data if it fails.
function isGrounded(reply: string, knownProducts: SearchedProduct[]): boolean {
  const mentionedPrices = [...reply.matchAll(/\$\s?(\d+(?:\.\d{1,2})?)/g)].map((m) => Number(m[1]));
  if (mentionedPrices.length === 0) return true; // nothing to check
  const knownPrices = new Set(knownProducts.map((p) => p.price).filter((p): p is number => p != null));
  return mentionedPrices.every((price) => [...knownPrices].some((known) => Math.abs(known - price) < 0.01));
}

function groundedFallback(knownProducts: SearchedProduct[]): string {
  if (knownProducts.length === 0) return "I couldn't find anything matching that in the catalog.";
  const list = knownProducts
    .slice(0, 5)
    .map((p) => `${p.name}${p.price != null ? ` ($${p.price.toFixed(2)})` : ''}`)
    .join(', ');
  return `Here's what I found: ${list}.`;
}

export async function POST(request: Request) {
  try {
    const { messages } = (await request.json()) as { messages: ChatMessage[] };
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages[] is required.' }, { status: 400 });
    }
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: 'Chat agent is not configured (missing GROQ_API_KEY).' }, { status: 503 });
    }

    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    const conversation: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];
    let lastSearchResults: SearchedProduct[] = [];

    for (let step = 0; step < MAX_STEPS; step++) {
      // Llama on Groq intermittently emits malformed function-call syntax, which
      // Groq rejects with 400 "Failed to call a function" (tool_use_failed)
      // instead of retrying internally — observed failing ~50% of identical
      // requests. It's a generation fluke, not a bad payload, so just re-ask.
      let res!: Response;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(GROQ_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          body: JSON.stringify({
            model: MODEL,
            temperature: 0.3,
            messages: conversation,
            tools: TOOLS,
            tool_choice: 'auto',
          }),
        });
        if (res.ok) break;

        const peek = await res.clone().text();
        const isToolGenerationFluke =
          res.status === 400 && /tool_use_failed|Failed to call a function/i.test(peek);
        if (!isToolGenerationFluke) break;
        console.warn(`[chat] tool_use_failed, retrying (attempt ${attempt + 1}/3)`);
      }

      if (!res.ok) {
        const text = await res.text();
        console.error('[chat] Groq error', res.status, text);
        // Surface the real reason in development — a generic message makes this
        // class of failure (bad model name, rate limit, malformed payload)
        // impossible to diagnose from the UI.
        let detail = text.slice(0, 300);
        try {
          detail = JSON.parse(text)?.error?.message ?? detail;
        } catch {
          /* keep raw text */
        }
        return NextResponse.json(
          {
            error:
              process.env.NODE_ENV === 'development'
                ? `Groq ${res.status}: ${detail}`
                : 'Chat agent request failed.',
          },
          { status: 502 }
        );
      }

      const data = await res.json();
      const choice = data.choices?.[0]?.message;
      if (!choice) return NextResponse.json({ error: 'No response from model.' }, { status: 502 });

      const toolCalls = choice.tool_calls as
        | { id: string; function: { name: string; arguments: string } }[]
        | undefined;

      // Basic observability: one line per agent step (which tool, if any).
      console.log(`[chat] step ${step}: tool_calls=${toolCalls?.map((t) => t.function.name).join(',') ?? 'none'}`);

      if (!toolCalls || toolCalls.length === 0) {
        // Final answer — no more tools requested. Verify it before trusting it.
        const reply = choice.content ?? '';
        if (isGrounded(reply, lastSearchResults)) {
          return NextResponse.json({ reply });
        }
        console.warn('[chat] ungrounded reply discarded, using deterministic fallback:', reply);
        return NextResponse.json({ reply: groundedFallback(lastSearchResults) });
      }

      // The model wants to act. Append its tool-call turn, then execute each
      // tool for real and append the results — this is the "loop" in agentic loop.
      conversation.push({ role: 'assistant', content: choice.content ?? '', tool_calls: toolCalls });
      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          /* malformed args -> empty, executeTool will report missing fields */
        }
        const result = await executeTool(supabase, user?.id ?? null, call.function.name, args);
        // Full visibility into each action without needing a debugger attached.
        console.log(`[chat]   → ${call.function.name}(${JSON.stringify(args)})`);
        console.log(`[chat]   ← ${result.slice(0, 200)}`);
        conversation.push({ role: 'tool', tool_call_id: call.id, content: result });

        if (call.function.name === 'search_products') {
          try {
            lastSearchResults = JSON.parse(result) as SearchedProduct[];
          } catch {
            /* leave lastSearchResults as-is if the tool returned an error shape */
          }
        }
      }
      // loop again so the model can read the tool results and respond/act further
    }

    return NextResponse.json({ reply: "I've made several changes — is there anything else you'd like?" });
  } catch (e) {
    console.error('chat route failed:', e);
    return NextResponse.json({ error: 'Chat failed.' }, { status: 500 });
  }
}
