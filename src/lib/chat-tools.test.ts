import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// executeTool imports the embedding model for search_products; these tests only
// exercise the cart/wishlist tools, so keep the heavy model out of the way.
vi.mock('./embeddings', () => ({ generateEmbedding: vi.fn() }));

import { TOOLS, WRITE_TOOLS, executeTool } from './chat-tools';

// ---- a tiny fake Supabase client --------------------------------------------
// Records every query and answers it from `respond`, so we can assert on exactly
// what the agent would have written to the database.

interface Call {
  table: string;
  op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' | null;
  payload?: unknown;
  options?: unknown;
  filters: Record<string, unknown>;
}
interface Reply {
  data?: unknown;
  error?: { message: string } | null;
}

function fakeClient(respond: (call: Call) => Reply) {
  const calls: Call[] = [];
  const answer = (call: Call): Reply => ({ data: null, error: null, ...respond(call) });

  const client = {
    from(table: string) {
      const call: Call = { table, op: null, filters: {} };
      calls.push(call);
      const chain = {
        select() {
          call.op ??= 'select';
          return chain;
        },
        insert(payload: unknown) {
          call.op = 'insert';
          call.payload = payload;
          return chain;
        },
        update(payload: unknown) {
          call.op = 'update';
          call.payload = payload;
          return chain;
        },
        delete() {
          call.op = 'delete';
          return chain;
        },
        upsert(payload: unknown, options?: unknown) {
          call.op = 'upsert';
          call.payload = payload;
          call.options = options;
          return chain;
        },
        eq(column: string, value: unknown) {
          call.filters[column] = value;
          return chain;
        },
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => Promise.resolve(answer(call)),
        then: (resolve: (v: Reply) => unknown) => Promise.resolve(answer(call)).then(resolve),
      };
      return chain;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const parse = (s: string) => JSON.parse(s) as Record<string, unknown>;
const findCall = (calls: Call[], table: string, op: Call['op']) => calls.find((c) => c.table === table && c.op === op);

describe('tool registry', () => {
  it('declares every write tool as a callable tool', () => {
    const names = TOOLS.map((t) => t.function.name);
    for (const w of WRITE_TOOLS) expect(names).toContain(w);
    expect(names).toContain('remove_from_cart');
    expect(names).toContain('get_product_details');
  });
});

describe('add_to_cart', () => {
  const happyPath = (existing: unknown = null, writeError: string | null = null) =>
    fakeClient((c) => {
      if (c.table === 'product_variants') return { data: { id: 7, price: 59.99 } };
      if (c.table === 'cart_items' && c.op === 'select') return { data: existing };
      if (c.table === 'cart_items' && (c.op === 'insert' || c.op === 'update')) {
        return { error: writeError ? { message: writeError } : null };
      }
      if (c.table === 'products') return { data: { name: 'Portable Bluetooth Speaker' } };
      return {};
    });

  it('refuses when nobody is logged in, and writes nothing', async () => {
    const { client, calls } = happyPath();
    const out = parse(await executeTool(client, null, 'add_to_cart', { product_id: 3 }));
    expect(out.error).toMatch(/not logged in/i);
    expect(calls).toHaveLength(0);
  });

  it('inserts a new cart row for the cheapest variant', async () => {
    const { client, calls } = happyPath(null);
    const out = parse(await executeTool(client, 'user-1', 'add_to_cart', { product_id: 3 }));

    expect(out).toMatchObject({ success: true, product_id: 3, name: 'Portable Bluetooth Speaker', quantity: 1, price: 59.99 });
    expect(findCall(calls, 'cart_items', 'insert')?.payload).toEqual({
      user_id: 'user-1',
      product_id: 3,
      product_variant_id: 7,
      quantity: 1,
    });
  });

  it('adds to the quantity when the item is already in the cart', async () => {
    const { client, calls } = happyPath({ id: 5, quantity: 2 });
    const out = parse(await executeTool(client, 'user-1', 'add_to_cart', { product_id: 3, quantity: 3 }));

    expect(out).toMatchObject({ success: true, quantity: 3 });
    const update = findCall(calls, 'cart_items', 'update');
    expect(update?.payload).toEqual({ quantity: 5 });
    expect(update?.filters).toMatchObject({ id: 5 });
    expect(findCall(calls, 'cart_items', 'insert')).toBeUndefined();
  });

  it('never reports success when the database write failed', async () => {
    const { client } = happyPath(null, 'permission denied');
    const out = parse(await executeTool(client, 'user-1', 'add_to_cart', { product_id: 3 }));
    expect(out.success).toBeUndefined();
    expect(String(out.error)).toContain('permission denied');
  });

  it('takes the user from the session, never from model-supplied arguments', async () => {
    const { client, calls } = happyPath(null);
    await executeTool(client, 'real-user', 'add_to_cart', { product_id: 3, user_id: 'attacker', userId: 'attacker' });

    expect(findCall(calls, 'cart_items', 'insert')?.payload).toMatchObject({ user_id: 'real-user' });
    expect(JSON.stringify(calls)).not.toContain('attacker');
  });
});

describe('remove_from_cart', () => {
  it('refuses when nobody is logged in', async () => {
    const { client, calls } = fakeClient(() => ({}));
    const out = parse(await executeTool(client, null, 'remove_from_cart', { product_id: 3 }));
    expect(out.error).toMatch(/not logged in/i);
    expect(calls).toHaveLength(0);
  });

  it('says so, and deletes nothing, when the item is not in the cart', async () => {
    const { client, calls } = fakeClient((c) => (c.op === 'select' ? { data: [] } : {}));
    const out = parse(await executeTool(client, 'user-1', 'remove_from_cart', { product_id: 3 }));

    expect(String(out.error)).toMatch(/isn.t in the cart/i);
    expect(findCall(calls, 'cart_items', 'delete')).toBeUndefined();
  });

  it('deletes only THIS user\'s rows for that product', async () => {
    const { client, calls } = fakeClient((c) => {
      if (c.table === 'cart_items' && c.op === 'select') return { data: [{ id: 1 }, { id: 2 }] };
      if (c.table === 'products') return { data: { name: 'Portable Bluetooth Speaker' } };
      return {};
    });
    const out = parse(await executeTool(client, 'user-1', 'remove_from_cart', { product_id: 3, user_id: 'attacker' }));

    expect(out).toMatchObject({ success: true, product_id: 3, removed: 2, name: 'Portable Bluetooth Speaker' });
    expect(findCall(calls, 'cart_items', 'delete')?.filters).toEqual({ user_id: 'user-1', product_id: 3 });
  });

  it('reports a database failure instead of claiming success', async () => {
    const { client } = fakeClient((c) => {
      if (c.op === 'select') return { data: [{ id: 1 }] };
      if (c.op === 'delete') return { error: { message: 'boom' } };
      return {};
    });
    const out = parse(await executeTool(client, 'user-1', 'remove_from_cart', { product_id: 3 }));
    expect(out.success).toBeUndefined();
    expect(String(out.error)).toContain('boom');
  });
});

describe('wishlist and save-for-later', () => {
  it('maps each tool to its kind and uses ignoreDuplicates so re-saving is a no-op', async () => {
    for (const [tool, kind] of [
      ['add_to_wishlist', 'wishlist'],
      ['save_for_later', 'saved_for_later'],
    ] as const) {
      const { client, calls } = fakeClient((c) => (c.table === 'products' ? { data: { name: 'Smart Fitness Watch' } } : {}));
      const out = parse(await executeTool(client, 'user-1', tool, { product_id: 2 }));

      expect(out).toMatchObject({ success: true, kind, name: 'Smart Fitness Watch' });
      const upsert = findCall(calls, 'saved_items', 'upsert');
      expect(upsert?.payload).toEqual({ user_id: 'user-1', product_id: 2, kind });
      // DO NOTHING on conflict: needs only INSERT permission (the table has no UPDATE policy).
      expect(upsert?.options).toMatchObject({ onConflict: 'user_id,product_id,kind', ignoreDuplicates: true });
    }
  });

  it('refuses when nobody is logged in', async () => {
    const { client, calls } = fakeClient(() => ({}));
    expect(parse(await executeTool(client, null, 'add_to_wishlist', { product_id: 2 })).error).toMatch(/not logged in/i);
    expect(calls).toHaveLength(0);
  });
});

describe('guards', () => {
  it('rejects views when logged out and unknown tools outright', async () => {
    const { client } = fakeClient(() => ({}));
    expect(parse(await executeTool(client, null, 'view_cart', {})).error).toMatch(/not logged in/i);
    expect(parse(await executeTool(client, null, 'view_saved', {})).error).toMatch(/not logged in/i);
    expect(parse(await executeTool(client, 'user-1', 'drop_all_tables', {})).error).toMatch(/Unknown tool/);
  });

  it('requires a product id for the write tools', async () => {
    const { client } = fakeClient(() => ({}));
    for (const tool of ['add_to_cart', 'remove_from_cart', 'add_to_wishlist', 'save_for_later']) {
      expect(parse(await executeTool(client, 'user-1', tool, {})).error).toMatch(/Missing product_id/);
    }
  });
});
