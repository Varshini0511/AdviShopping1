// src/lib/chat-tools.ts
//
// Tool definitions + executors for the conversational shopping agent.
//
// The LLM never touches the database directly — it can only request one of
// these named actions with structured arguments (Groq's OpenAI-compatible
// "tool calling" format). Our code executes the action for real and reports
// the result back. This is what keeps the agent GROUNDED: it can't claim an
// item was added to the cart unless the tool actually did it.
//
// Token cost note: these schemas are re-sent on EVERY pass of the agent loop,
// and the free tier is metered per minute — so keep descriptions short.

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateEmbedding } from './embeddings';

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Search the catalog (keyword + semantic). Use first to get a product id.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to search for, e.g. "wireless headphones"' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_details',
      description: 'Get specs (e.g. camera), rating and price range for one product. Use it to compare candidates before choosing.',
      parameters: {
        type: 'object',
        properties: { product_id: { type: 'number' } },
        required: ['product_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_to_cart',
      description: 'Add a product to the cart. Needs a product_id from search_products.',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'number' },
          quantity: { type: 'number', description: 'Default 1' },
        },
        required: ['product_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_to_wishlist',
      description: 'Save a product to the wishlist (browsing, no purchase intent).',
      parameters: {
        type: 'object',
        properties: { product_id: { type: 'number' } },
        required: ['product_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_for_later',
      description: 'Save a product for later (stronger purchase intent than a wishlist).',
      parameters: {
        type: 'object',
        properties: { product_id: { type: 'number' } },
        required: ['product_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'view_cart',
      description: "List what's in the user's cart.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'view_saved',
      description: "List the user's wishlist and saved-for-later items.",
      parameters: { type: 'object', properties: {} },
    },
  },
] as const;

// Tools that change data. After one of these succeeds (or fails) there is
// nothing left for the model to decide, so the route can answer directly.
export const WRITE_TOOLS = new Set(['add_to_cart', 'add_to_wishlist', 'save_for_later']);

// Read-only views of the user's own data. Their output is complete and exact,
// so the route can render it directly instead of asking the model to paraphrase.
export const READ_TOOLS = new Set(['view_cart', 'view_saved']);

type ToolArgs = Record<string, unknown>;

async function productName(supabase: SupabaseClient, id: number): Promise<string | null> {
  const { data } = await supabase.from('products').select('name').eq('id', id).maybeSingle();
  return (data as { name?: string } | null)?.name ?? null;
}

// NOTE: "buy this now" intentionally does NOT process a payment — this app has
// no payment gateway. add_to_cart is the correct tool for purchase intent; the
// system prompt instructs the model to say so rather than claim a completed
// purchase. This is a guardrail against the agent fabricating a transaction.
export async function executeTool(
  supabase: SupabaseClient,
  userId: string | null,
  name: string,
  args: ToolArgs
): Promise<string> {
  switch (name) {
    case 'search_products': {
      const query = String(args.query ?? '').trim();
      if (!query) return JSON.stringify({ error: 'No query given.' });

      const embedding = await generateEmbedding(query);
      const { data: kw, error: kwErr } = await supabase
        .rpc('keyword_search', { query_text: query, match_count: 5 })
        .select('id, name, discount_percent, stock');
      const { data: sem, error: semErr } = await supabase
        .rpc('semantic_search', { query_embedding: embedding, match_count: 5 })
        .select('id, name, discount_percent, stock');

      // Distinguish "genuinely zero matches" from "the search itself failed" —
      // otherwise a DB/network error silently looks identical to an empty
      // catalog, and the agent would tell the user "not found" when the truth
      // is "the search couldn't run."
      if (kwErr && semErr) {
        return JSON.stringify({ error: 'Product search is temporarily unavailable. Please try again shortly.' });
      }

      const seen = new Map<number, { id: number; name: string; stock: number }>();
      [...(kw ?? []), ...(sem ?? [])].forEach((p) => seen.set(p.id, p));
      const results = [...seen.values()].slice(0, 6);

      // attach cheapest price for each
      const ids = results.map((r) => r.id);
      const { data: variants } = ids.length
        ? await supabase.from('product_variants').select('product_id, price').in('product_id', ids)
        : { data: [] };
      const priceById = new Map<number, number>();
      (variants ?? []).forEach((v: { product_id: number; price: number }) => {
        const cur = priceById.get(v.product_id);
        if (cur === undefined || v.price < cur) priceById.set(v.product_id, v.price);
      });

      return JSON.stringify(
        results.map((r) => ({
          id: r.id,
          name: r.name,
          price: priceById.get(r.id) ?? null,
          in_stock: r.stock > 0,
        }))
      );
    }

    // The "Observe" half of a compare-then-decide ReAct loop: search_products only
    // returns name + price, so without this the agent has nothing to judge
    // "best camera" with. Output is kept compact — it is re-sent on every pass.
    case 'get_product_details': {
      const productId = Number(args.product_id);
      if (!productId) return JSON.stringify({ error: 'Missing product_id.' });

      const { data: p } = await supabase
        .from('products')
        .select('id, name, description, rating, review_count, stock, product_spec(spec_name, spec_value), product_variants(price)')
        .eq('id', productId)
        .maybeSingle();
      if (!p) return JSON.stringify({ error: 'Product not found.' });

      const row = p as unknown as {
        id: number;
        name: string;
        description: string | null;
        rating: number | null;
        review_count: number | null;
        stock: number;
        product_spec: { spec_name: string; spec_value: string }[] | null;
        product_variants: { price: number }[] | null;
      };
      const prices = (row.product_variants ?? []).map((v) => Number(v.price)).filter(Number.isFinite);
      return JSON.stringify({
        id: row.id,
        name: row.name,
        specs: Object.fromEntries((row.product_spec ?? []).map((s) => [s.spec_name, s.spec_value])),
        summary: String(row.description ?? '').slice(0, 220),
        rating: row.rating,
        reviews: row.review_count,
        price_from: prices.length ? Math.min(...prices) : null,
        price_to: prices.length ? Math.max(...prices) : null,
        in_stock: row.stock > 0,
      });
    }

    case 'add_to_cart': {
      if (!userId) return JSON.stringify({ error: 'User is not logged in. Ask them to log in first.' });
      const productId = Number(args.product_id);
      const quantity = Math.max(1, Number(args.quantity) || 1);
      if (!productId) return JSON.stringify({ error: 'Missing product_id.' });

      const { data: variant } = await supabase
        .from('product_variants')
        .select('id, price')
        .eq('product_id', productId)
        .order('price', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!variant) return JSON.stringify({ error: 'Product has no purchasable variant.' });

      const { data: existing } = await supabase
        .from('cart_items')
        .select('id, quantity')
        .eq('user_id', userId)
        .eq('product_id', productId)
        .eq('product_variant_id', variant.id)
        .maybeSingle();

      const writeError = existing
        ? (
            await supabase
              .from('cart_items')
              .update({ quantity: existing.quantity + quantity })
              .eq('id', existing.id)
          ).error
        : (
            await supabase.from('cart_items').insert({
              user_id: userId,
              product_id: productId,
              product_variant_id: variant.id,
              quantity,
            })
          ).error;

      // Only claim success if the write actually succeeded — a silent write
      // failure must never be reported to the user as "added to your cart."
      if (writeError) return JSON.stringify({ error: `Could not add to cart: ${writeError.message}` });
      return JSON.stringify({
        success: true,
        product_id: productId,
        name: await productName(supabase, productId),
        quantity,
        price: variant.price,
      });
    }

    case 'add_to_wishlist':
    case 'save_for_later': {
      if (!userId) return JSON.stringify({ error: 'User is not logged in. Ask them to log in first.' });
      const productId = Number(args.product_id);
      if (!productId) return JSON.stringify({ error: 'Missing product_id.' });
      const kind = name === 'add_to_wishlist' ? 'wishlist' : 'saved_for_later';
      const { error } = await supabase
        .from('saved_items')
        .upsert({ user_id: userId, product_id: productId, kind }, { onConflict: 'user_id,product_id,kind' });
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({
        success: true,
        product_id: productId,
        name: await productName(supabase, productId),
        kind,
      });
    }

    case 'view_cart': {
      if (!userId) return JSON.stringify({ error: 'User is not logged in.' });
      const { data } = await supabase
        .from('cart_items')
        .select('quantity, product_variants(price, products(name))')
        .eq('user_id', userId);
      return JSON.stringify(data ?? []);
    }

    case 'view_saved': {
      if (!userId) return JSON.stringify({ error: 'User is not logged in.' });
      const { data } = await supabase
        .from('saved_items')
        .select('kind, products(name)')
        .eq('user_id', userId);
      return JSON.stringify(data ?? []);
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
