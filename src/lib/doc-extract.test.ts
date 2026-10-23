import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractDocument, UpstreamUnavailableError } from './doc-extract';

// The model is mocked: these tests are about the ENGINE around it — validation,
// the repair retry, backoff on provider outages, refusing non-documents.

const goodReceipt = {
  type: 'receipt',
  data: {
    merchant: 'Corner Cafe',
    date: 'May 3, 2025',
    currency: '$',
    line_items: [
      { description: 'Latte', quantity: 2, amount: '9.00' },
      { description: 'Croissant', quantity: 1, amount: '3.50' },
    ],
    subtotal: 12.5,
    tax: 1,
    total: '13.50',
    payment_method: 'VISA ****4242',
  },
};

/** A fake Groq chat-completions response whose message content is `payload`. */
function groq(payload: unknown, status = 200): Response {
  const content = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}

const input = { kind: 'text', text: 'Corner Cafe ... TOTAL 13.50' } as const;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('extractDocument', () => {
  it('returns validated, normalised data on a clean first answer', async () => {
    fetchMock.mockResolvedValueOnce(groq(goodReceipt));
    const r = await extractDocument(input);

    expect(r.type).toBe('receipt');
    expect(r.attempts).toBe(1);
    expect(r.error).toBeUndefined();
    expect(r.confidence).toBe(1);
    expect(r.needsReview).toBe(false);
    // normalisation happened: "$" → USD, "May 3, 2025" → ISO, "13.50" → number
    expect(r.data).toMatchObject({ currency: 'USD', date: '2025-05-03', total: 13.5 });
    expect(r.tokens).toEqual({ prompt: 100, completion: 50 });
  });

  it('repairs a failed answer once, feeding the validation errors back', async () => {
    const broken = { type: 'receipt', data: { ...goodReceipt.data, total: undefined } };
    fetchMock.mockResolvedValueOnce(groq(broken)).mockResolvedValueOnce(groq(goodReceipt));

    const r = await extractDocument(input);

    expect(r.attempts).toBe(2);
    expect(r.type).toBe('receipt');
    expect(r.confidence).toBe(0.85); // repaired answers are trusted a little less
    const secondRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    const lastMessage = secondRequest.messages.at(-1).content as string;
    expect(lastMessage).toContain('failed validation');
    expect(lastMessage).toContain('total');
  });

  it('gives up after ONE repair rather than looping forever', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(groq({ type: 'receipt', data: { merchant: 'x' } })));
    const r = await extractDocument(input);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.data).toBeNull();
    expect(r.needsReview).toBe(true);
    expect(r.error).toMatch(/Could not extract valid data/);
  });

  it('treats non-JSON replies as a validation failure and retries', async () => {
    fetchMock.mockResolvedValueOnce(groq('Sure! Here is your receipt:')).mockResolvedValueOnce(groq(goodReceipt));
    const r = await extractDocument(input);
    expect(r.attempts).toBe(2);
    expect(r.type).toBe('receipt');
  });

  it('refuses documents that are none of the three types, without retrying', async () => {
    fetchMock.mockResolvedValueOnce(groq({ type: 'other', data: null }));
    const r = await extractDocument(input);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.type).toBe('unknown');
    expect(r.data).toBeNull();
    expect(r.error).toMatch(/does not look like/);
  });

  it('flags inconsistent arithmetic for human review', async () => {
    const wrongTotal = { ...goodReceipt, data: { ...goodReceipt.data, total: 18.5 } };
    fetchMock.mockResolvedValueOnce(groq(wrongTotal));
    const r = await extractDocument(input);

    expect(r.checks.map((c) => c.code)).toContain('total_mismatch');
    expect(r.needsReview).toBe(true);
    expect(r.confidence).toBeLessThan(0.8);
  });

  it('strips <think> blocks and code fences from the reply', async () => {
    const wrapped = `<think>hmm</think>\n\`\`\`json\n${JSON.stringify(goodReceipt)}\n\`\`\``;
    fetchMock.mockResolvedValueOnce(groq(wrapped));
    expect((await extractDocument(input)).type).toBe('receipt');
  });
});

describe('provider outages (HTTP 503 "over capacity")', () => {
  it('backs off and succeeds once the provider recovers', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(new Response('{"error":"over capacity"}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"error":"over capacity"}', { status: 503 }))
      .mockResolvedValueOnce(groq(goodReceipt));

    const pending = extractDocument(input);
    await vi.advanceTimersByTimeAsync(10_000);
    const r = await pending;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(r.type).toBe('receipt');
    expect(r.attempts).toBe(1); // outage retries are not "repair" attempts
  });

  it('throws a clear UpstreamUnavailableError if it never recovers', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{"error":"over capacity"}', { status: 503 })));

    const pending = extractDocument(input).catch((e) => e);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await pending).toBeInstanceOf(UpstreamUnavailableError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
