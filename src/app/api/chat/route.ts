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
import { TOOLS, WRITE_TOOLS, READ_TOOLS, executeTool } from '@/lib/chat-tools';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
// Groq rotates its model catalog and removes older ones without much notice
// (llama-3.3-70b-versatile started returning 404 model_not_found). Override with
// GROQ_MODEL if this one is retired too — check https://console.groq.com/docs/models
const MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const MAX_STEPS = 5; // hard cap on the agent loop so a confused model can't spin forever
// Replies are 1-3 sentences or a short tool call; anything longer is a runaway
// generation. The free tier's output-tokens-per-minute budget is small (1000
// for this model), so an uncapped bad generation starves every later request.
const MAX_OUTPUT_TOKENS = 400;
// Per-visitor cap on chat messages. Generous for a human (each message is one
// request) but stops a script from draining the shared Groq quota.
const CHAT_REQUESTS_PER_MINUTE = 12;
// Longest we'll sleep on a 429 before giving up and telling the user.
const MAX_RATE_LIMIT_WAIT_MS = 10_000;

// Groq says how long to wait in a `retry-after` header (seconds) and in the
// error text ("Please try again in 6.9s"). Returns null if neither is present.
function parseRetryAfterMs(res: Response, body: string): number | null {
  const header = Number(res.headers.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return Math.ceil(header * 1000) + 250;
  const m = body.match(/try again in ([\d.]+)\s*(ms|s)/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Math.ceil(m[2].toLowerCase() === 'ms' ? n : n * 1000) + 250;
}

// Sent on every pass of the loop, so it is kept compact (free tier is metered
// per minute). Same rules as before, fewer words.
const SYSTEM_PROMPT = `You are the AdviShopping shopping assistant in the store's chat widget. You can search the catalog and manage the user's cart, wishlist and saved-for-later list ONLY through the provided tools. Never claim an action succeeded unless a tool reported success.

Rules:
- Call search_products at most once per request; reuse its product_ids afterwards.
- Browsing/searching (no add/buy/save/wishlist verb): name the matching product(s) with price, then stop.
- Add/buy/save/wishlist: search once, then immediately call the matching tool (add_to_cart / add_to_wishlist / save_for_later) with the best-match product_id, then report what you did.
- "buy"/"purchase": there is no payment processing — call add_to_cart and tell them to review it at checkout. Never claim a purchase completed.
- If a tool says the user is not logged in, tell them to log in.
- CRITICAL: only mention product names and prices that appear exactly in a tool result from this conversation — never from your own knowledge. If nothing relevant was found, say so.
- Keep replies to 1-3 short sentences.`;

// Only the most recent turns are sent to the model. The widget posts the whole
// transcript every time, and every pass of the agent loop re-sends it, so an
// unbounded history is what makes a long chat hit the per-minute token limit.
const MAX_HISTORY_MESSAGES = 6;
const MAX_HISTORY_CHARS = 600;

// Requests like "add it and show my cart" need a follow-up model pass; only
// short-circuit a write action when the user asked for nothing else.
const COMPOUND_INTENT = /\b(and|then|also|plus|show|view|list|display|what|which|how)\b/i;

type ChatMessage = { role: 'user' | 'assistant' | 'system' | 'tool'; content: string; tool_call_id?: string; tool_calls?: unknown };
type SearchedProduct = { id: number; name: string; price: number | null };
type ToolOutcome = { tool: string; result: Record<string, unknown> };

// Builds the user-facing reply for write actions straight from what the tool
// actually did — no model pass needed, and it can't misreport the outcome.
function describeWrites(outcomes: ToolOutcome[]): string {
  const lines = outcomes.map(({ tool, result }) => {
    if (result.success) {
      const name = typeof result.name === 'string' ? result.name : 'that item';
      if (tool === 'add_to_cart') {
        const qty = Number(result.quantity) || 1;
        const price = Number(result.price);
        const priceText = Number.isFinite(price) ? ` ($${price.toFixed(2)}${qty > 1 ? ' each' : ''})` : '';
        return `Added ${qty > 1 ? `${qty} × ` : ''}${name}${priceText} to your cart.`;
      }
      return tool === 'add_to_wishlist' ? `Saved ${name} to your wishlist.` : `Saved ${name} for later.`;
    }
    if (/not logged in/i.test(String(result.error ?? ''))) {
      return "Please log in first — I can only change your cart or wishlist when you're signed in.";
    }
    return "Sorry, I couldn't do that just now. Please try again in a moment.";
  });
  return [...new Set(lines)].join(' ');
}

// ---- Read-only views (view_cart / view_saved) ---------------------------
//
// PostgREST returns an embedded relation as an object or a 1-element array
// depending on the relationship, so unwrap defensively.
const one = <T,>(v: unknown): T | undefined => (Array.isArray(v) ? v[0] : v) as T | undefined;

type CartLine = { name: string; quantity: number; price: number };

function parseCart(result: unknown): CartLine[] {
  if (!Array.isArray(result)) return [];
  return result.flatMap((row) => {
    const variant = one<{ price?: number; products?: unknown }>(row?.product_variants);
    const product = one<{ name?: string }>(variant?.products);
    const price = Number(variant?.price);
    if (!product?.name || !Number.isFinite(price)) return [];
    return [{ name: product.name, quantity: Number(row.quantity) || 1, price }];
  });
}

// Every dollar figure a cart view legitimately contains: unit prices, line
// totals and the grand total (a model summarising the cart will state these).
function cartPrices(lines: CartLine[]): number[] {
  const total = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  return [...lines.flatMap((l) => [l.price, l.price * l.quantity]), total];
}

const LOGIN_MESSAGE = "Please log in first — I can only change your cart or wishlist when you're signed in.";

function describeReads(outcomes: { tool: string; result: unknown }[]): string {
  const lines = outcomes.map(({ tool, result }) => {
    if (!Array.isArray(result)) {
      return /not logged in/i.test(String((result as { error?: string })?.error ?? ''))
        ? LOGIN_MESSAGE
        : "Sorry, I couldn't look that up just now. Please try again in a moment.";
    }

    if (tool === 'view_cart') {
      const items = parseCart(result);
      if (items.length === 0) return 'Your cart is empty.';
      const total = items.reduce((sum, l) => sum + l.price * l.quantity, 0);
      const list = items
        .map((l) => `${l.quantity > 1 ? `${l.quantity} × ` : ''}${l.name} ($${l.price.toFixed(2)}${l.quantity > 1 ? ' each' : ''})`)
        .join(', ');
      return `In your cart: ${list}. Total: $${total.toFixed(2)}.`;
    }

    // view_saved
    const names = (kind: string) =>
      result
        .filter((r) => r?.kind === kind)
        .map((r) => one<{ name?: string }>(r.products)?.name)
        .filter((n): n is string => Boolean(n));
    const wishlist = names('wishlist');
    const later = names('saved_for_later');
    if (wishlist.length === 0 && later.length === 0) return "You haven't saved anything yet.";
    return [
      wishlist.length ? `Wishlist: ${wishlist.join(', ')}.` : '',
      later.length ? `Saved for later: ${later.join(', ')}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
  });
  return [...new Set(lines)].join(' ');
}

// A view request that also asks for a change ("show my cart and add the
// watch") must still go through the model, so don't short-circuit those.
const WRITE_VERB = /\b(add|buy|purchase|save|wishlist|remove|delete|put|move|checkout)\b/i;

// Grounding guardrail: LLMs (even well-prompted ones) sometimes invent a
// plausible-sounding product/price instead of using the real tool result.
// Rather than trust the prompt alone, we verify every price the model states
// against the real numbers search_products actually returned this turn, and
// replace the reply with a deterministic one built from real data if it fails.
function isGrounded(reply: string, knownProducts: SearchedProduct[], extraPrices: number[] = []): boolean {
  // Handles "$199.99", "$1,199" and "$1,199.99" — the comma form must be
  // matched whole, or "$1,199" would be read as "$1" and flagged as invented.
  const mentionedPrices = [...reply.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?/g)].map((m) =>
    Number(m[1].replace(/,/g, '') + (m[2] ?? ''))
  );
  if (mentionedPrices.length === 0) return true; // nothing to check
  // Trusted prices = whatever ANY tool returned this turn (search results, and
  // cart unit/line/total prices) — not just search, or an accurate cart summary
  // would be thrown away as "invented".
  const knownPrices = new Set([
    ...knownProducts.map((p) => p.price).filter((p): p is number => p != null),
    ...extraPrices,
  ]);
  return mentionedPrices.every((price) => [...knownPrices].some((known) => Math.abs(known - price) < 0.01));
}

function groundedFallback(knownProducts: SearchedProduct[], searched: boolean): string {
  if (knownProducts.length === 0) {
    // "Nothing in the catalog" is only true if we actually searched it.
    return searched
      ? "I couldn't find anything matching that in the catalog."
      : "Sorry, I couldn't put that together — could you rephrase?";
  }
  const list = knownProducts
    .slice(0, 5)
    .map((p) => `${p.name}${p.price != null ? ` ($${p.price.toFixed(2)})` : ''}`)
    .join(', ');
  return `Here's what I found: ${list}.`;
}

export async function POST(request: Request) {
  // Per-IP limit, checked before any work (or any Groq spend) happens. Note this
  // is separate from Groq's own account-wide limit handled further down.
  const limited = rateLimit(`chat:${clientIp(request)}`, CHAT_REQUESTS_PER_MINUTE, 60_000);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);

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

    // Keep only user/assistant turns (so a client can't smuggle in its own
    // `system` or `tool` messages), cap the length, and make sure the window
    // doesn't start on an assistant reply.
    const history = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({ role: m.role, content: String(m.content ?? '').slice(0, MAX_HISTORY_CHARS) }));
    while (history.length > 0 && history[0].role !== 'user') history.shift();
    if (history.length === 0) {
      return NextResponse.json({ error: 'A user message is required.' }, { status: 400 });
    }
    const lastUserText = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';

    const conversation: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...history];
    let lastSearchResults: SearchedProduct[] = [];
    let searched = false; // did we actually query the catalog this turn?
    const extraPrices: number[] = []; // prices from cart views, for the guardrail

    for (let step = 0; step < MAX_STEPS; step++) {
      // Llama on Groq intermittently emits malformed function-call syntax, which
      // Groq rejects with 400 "Failed to call a function" (tool_use_failed)
      // instead of retrying internally — observed failing ~50% of identical
      // requests. It's a generation fluke, not a bad payload, so just re-ask.
      //
      // On the FIRST step we require a tool call. Without this the model
      // sometimes skips the tools and answers from its own knowledge — in
      // practice a long, invented product list that burns the free tier's
      // output-token budget (and that isGrounded() then has to throw away).
      // Every user intent here (search / add / view) maps to a tool, so
      // requiring one is safe; later steps are free to answer in plain text.
      let toolChoice: 'auto' | 'required' = step === 0 ? 'required' : 'auto';
      let res!: Response;
      for (let attempt = 0; attempt < 3; attempt++) {
        res = await fetch(GROQ_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          body: JSON.stringify({
            model: MODEL,
            temperature: 0.3,
            // Hard cap on output so one bad generation can't run away.
            max_tokens: MAX_OUTPUT_TOKENS,
            messages: conversation,
            tools: TOOLS,
            tool_choice: toolChoice,
          }),
        });
        if (res.ok) break;

        const peek = await res.clone().text();

        // Rate limited (free tier is per-minute). If the suggested wait is
        // short, wait it out and retry instead of failing the user's message.
        if (res.status === 429) {
          const waitMs = parseRetryAfterMs(res, peek);
          if (waitMs !== null && waitMs <= MAX_RATE_LIMIT_WAIT_MS && attempt < 2) {
            console.warn(`[chat] rate limited, waiting ${waitMs}ms (attempt ${attempt + 1}/3)`);
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }
          break;
        }

        const isToolGenerationFluke =
          res.status === 400 && /tool_use_failed|Failed to call a function/i.test(peek);
        if (!isToolGenerationFluke) {
          // Some models/providers reject tool_choice:'required' — degrade to
          // 'auto' once rather than failing the whole request.
          if (res.status === 400 && toolChoice === 'required') {
            console.warn("[chat] tool_choice 'required' rejected, falling back to 'auto'");
            toolChoice = 'auto';
            continue;
          }
          break;
        }
        console.warn(`[chat] tool_use_failed, retrying (attempt ${attempt + 1}/3)`);
      }

      if (res.status === 429) {
        console.error('[chat] Groq rate limit not recoverable within wait budget');
        return NextResponse.json(
          {
            error:
              'The assistant is busy right now (free-tier rate limit). Please try again in a few seconds.',
          },
          { status: 429 }
        );
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
      // Token usage matters here: the free tier is metered per minute, and every
      // step re-sends the system prompt + all tool schemas + the conversation.
      const usage = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
      console.log(
        `[chat] step ${step}: tool_calls=${toolCalls?.map((t) => t.function.name).join(',') ?? 'none'}` +
          ` tokens(in/out)=${usage?.prompt_tokens ?? '?'}/${usage?.completion_tokens ?? '?'}`
      );

      if (!toolCalls || toolCalls.length === 0) {
        // Final answer — no more tools requested. Verify it before trusting it.
        const reply = choice.content ?? '';
        if (isGrounded(reply, lastSearchResults, extraPrices)) {
          return NextResponse.json({ reply });
        }
        console.warn('[chat] ungrounded reply discarded, using deterministic fallback:', reply);
        return NextResponse.json({ reply: groundedFallback(lastSearchResults, searched) });
      }

      // The model wants to act. Append its tool-call turn, then execute each
      // tool for real and append the results — this is the "loop" in agentic loop.
      conversation.push({ role: 'assistant', content: choice.content ?? '', tool_calls: toolCalls });
      const outcomes: ToolOutcome[] = [];
      const readOutcomes: { tool: string; result: unknown }[] = [];
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
          searched = true;
          try {
            lastSearchResults = JSON.parse(result) as SearchedProduct[];
          } catch {
            /* leave lastSearchResults as-is if the tool returned an error shape */
          }
        } else if (READ_TOOLS.has(call.function.name)) {
          let parsed: unknown = null;
          try {
            parsed = JSON.parse(result);
          } catch {
            /* leave null -> describeReads reports a lookup failure */
          }
          readOutcomes.push({ tool: call.function.name, result: parsed });
          if (call.function.name === 'view_cart') extraPrices.push(...cartPrices(parseCart(parsed)));
        } else if (WRITE_TOOLS.has(call.function.name)) {
          try {
            outcomes.push({ tool: call.function.name, result: JSON.parse(result) });
          } catch {
            outcomes.push({ tool: call.function.name, result: { error: 'unreadable tool result' } });
          }
        }
      }

      // Every call this step was a write action (add / wishlist / save) and the
      // user asked for nothing more: the outcome is fully known, so answer from
      // the tool results directly. Saves a whole LLM pass (~1.3k tokens), which
      // matters on a per-minute-metered free tier — and removes any chance of
      // the model paraphrasing the result wrongly.
      if (
        outcomes.length === toolCalls.length &&
        outcomes.length > 0 &&
        !COMPOUND_INTENT.test(lastUserText)
      ) {
        return NextResponse.json({ reply: describeWrites(outcomes) });
      }

      // Same idea for pure read-only views of the user's own cart/wishlist: the
      // tool result IS the answer, so render it directly (exact, and no model
      // pass). Skipped if the message also asks for a change.
      if (
        readOutcomes.length === toolCalls.length &&
        readOutcomes.length > 0 &&
        !WRITE_VERB.test(lastUserText)
      ) {
        return NextResponse.json({ reply: describeReads(readOutcomes) });
      }
      // loop again so the model can read the tool results and respond/act further
    }

    return NextResponse.json({ reply: "I've made several changes — is there anything else you'd like?" });
  } catch (e) {
    console.error('chat route failed:', e);
    return NextResponse.json({ error: 'Chat failed.' }, { status: 500 });
  }
}
