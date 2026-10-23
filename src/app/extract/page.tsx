// src/app/extract/page.tsx
//
// Document AI: upload (or pick a sample) invoice / receipt / product datasheet
// and see the structured data a vision-capable model extracted from it, along
// with a confidence score and the consistency checks behind it.
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FiAlertTriangle, FiCheckCircle, FiCopy, FiFileText, FiUploadCloud } from 'react-icons/fi';

type Check = { code: string; message: string; severity: 'error' | 'warn' };
type LineItem = { description: string; quantity: number; unit_price?: number | null; amount: number };
type Spec = { name: string; value: string };
type Data = Record<string, unknown>;
type Result = {
  type: 'invoice' | 'receipt' | 'datasheet' | 'unknown';
  data: Data | null;
  confidence: number;
  needsReview: boolean;
  checks: Check[];
  attempts: number;
  tokens: { prompt: number; completion: number };
  error?: string;
};

const SAMPLES = [
  { label: 'Invoice (PDF)', path: '/samples/sample-invoice.pdf', name: 'sample-invoice.pdf', mime: 'application/pdf' },
  { label: 'Receipt (photo)', path: '/samples/sample-receipt.png', name: 'sample-receipt.png', mime: 'image/png' },
  { label: 'Product datasheet (PDF)', path: '/samples/sample-datasheet.pdf', name: 'sample-datasheet.pdf', mime: 'application/pdf' },
  { label: 'Invoice with an error (flagged)', path: '/samples/sample-invoice-flagged.pdf', name: 'sample-invoice-flagged.pdf', mime: 'application/pdf' },
];

const MAX_BYTES = 5 * 1024 * 1024;
const OK_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'];

const TYPE_LABEL: Record<Result['type'], string> = {
  invoice: 'Invoice',
  receipt: 'Receipt',
  datasheet: 'Product datasheet',
  unknown: 'Unrecognised',
};

// Which scalar fields to show for each type: [label, key].
const FIELDS: Record<'invoice' | 'receipt' | 'datasheet', [string, string][]> = {
  invoice: [
    ['Vendor', 'vendor'],
    ['Invoice no.', 'invoice_number'],
    ['Invoice date', 'invoice_date'],
    ['Due date', 'due_date'],
    ['Currency', 'currency'],
  ],
  receipt: [
    ['Merchant', 'merchant'],
    ['Date', 'date'],
    ['Currency', 'currency'],
    ['Payment', 'payment_method'],
  ],
  datasheet: [
    ['Product', 'product_name'],
    ['Manufacturer', 'manufacturer'],
    ['Model', 'model'],
    ['Category', 'category'],
  ],
};

function money(value: unknown, currency: unknown): string {
  if (typeof value !== 'number') return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) ? currency : 'USD',
    }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

export default function ExtractPage() {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function run(file: File) {
    setResult(null);
    setError(null);
    setCopied(false);
    setFileName(file.name);

    if (file.size > MAX_BYTES) return setError('That file is too large — the limit is 5 MB.');
    if (file.type && !OK_TYPES.includes(file.type)) {
      return setError('Please upload a PDF, a PNG/JPG/WebP image, or a text file.');
    }

    setLoading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/extract', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Extraction failed.');
      setResult(data as Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extraction failed.');
    } finally {
      setLoading(false);
    }
  }

  async function runSample(s: (typeof SAMPLES)[number]) {
    try {
      const blob = await (await fetch(s.path)).blob();
      await run(new File([blob], s.name, { type: s.mime }));
    } catch {
      setError('Could not load the sample document.');
    }
  }

  async function copyJson() {
    if (!result?.data) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify({ type: result.type, data: result.data }, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard can be blocked; the JSON is still visible below */
    }
  }

  const data = result?.data ?? null;
  const type = result?.type;
  const lineItems = (data?.line_items as LineItem[] | undefined) ?? [];
  const specs = (data?.specs as Spec[] | undefined) ?? [];
  const features = (data?.features as string[] | undefined) ?? [];
  const currency = data?.currency;
  const pct = Math.round((result?.confidence ?? 0) * 100);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-100">
        <FiFileText aria-hidden /> Document AI
      </h1>
      <p className="mt-1 text-sm text-slate-400">
        Upload an <strong className="text-slate-300">invoice</strong>, a <strong className="text-slate-300">receipt</strong>{' '}
        or a <strong className="text-slate-300">product datasheet</strong>. A vision-capable model reads it, the output is
        validated against a schema, and the arithmetic is cross-checked — so you see how much to trust it.
      </p>

      {/* Samples */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Try a sample</span>
        {SAMPLES.map((s) => (
          <button
            key={s.path}
            onClick={() => void runSample(s)}
            disabled={loading}
            className="rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-sm font-medium text-indigo-200 transition hover:bg-indigo-500/20 disabled:opacity-50"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Upload */}
      <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-8 text-center transition hover:border-indigo-400/60">
        <FiUploadCloud className="text-3xl text-slate-400" aria-hidden />
        <span className="text-sm font-medium text-slate-200">Click to upload a document</span>
        <span className="text-xs text-slate-500">PDF (with a text layer), PNG, JPG or WebP · up to 5 MB · not stored</span>
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void run(f);
          }}
        />
      </label>

      {loading && (
        <p role="status" className="mt-6 text-sm text-slate-400">
          Reading {fileName}… this usually takes a few seconds.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      {result && data && type && type !== 'unknown' && (
        <div className="mt-6 space-y-5">
          {/* Header: type + confidence */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
            <span className="rounded-full bg-indigo-600 px-3 py-1 text-sm font-semibold text-white">{TYPE_LABEL[type]}</span>
            <div className="min-w-40 flex-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Confidence</span>
                <span className="font-semibold text-slate-200">{pct}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800" aria-hidden>
                <div
                  className={`h-full rounded-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-400' : 'bg-rose-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-slate-500">
              {result.attempts} model call{result.attempts > 1 ? 's' : ''} · {result.tokens.prompt + result.tokens.completion} tokens
            </span>
          </div>

          {/* Verdict */}
          {result.needsReview ? (
            <div role="alert" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              <p className="flex items-center gap-2 font-semibold">
                <FiAlertTriangle aria-hidden /> Needs human review
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-200">
                {result.checks.map((c) => (
                  <li key={c.code + c.message}>{c.message}</li>
                ))}
                {result.checks.length === 0 && <li>The first answer failed validation and had to be repaired.</li>}
              </ul>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-emerald-300">
              <FiCheckCircle aria-hidden /> The numbers are internally consistent — line items, subtotal, tax and total agree.
            </p>
          )}
          {!result.needsReview && result.checks.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-xs text-slate-400">
              {result.checks.map((c) => (
                <li key={c.code + c.message}>{c.message}</li>
              ))}
            </ul>
          )}

          {/* Scalar fields */}
          <dl className="grid gap-x-6 gap-y-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:grid-cols-2">
            {FIELDS[type].map(([label, key]) => (
              <div key={key}>
                <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
                <dd className="text-sm text-slate-100">{data[key] == null ? <span className="text-slate-500">not found</span> : String(data[key])}</dd>
              </div>
            ))}
            {type === 'datasheet' && (
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Price</dt>
                <dd className="text-sm text-slate-100">
                  {typeof data.price === 'number' ? money(data.price, data.currency) : <span className="text-slate-500">not listed</span>}
                </dd>
              </div>
            )}
          </dl>

          {/* Line items (invoice, receipt) */}
          {type !== 'datasheet' && lineItems.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/60">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Description</th>
                    <th className="px-2 py-2 text-right font-medium">Qty</th>
                    {type === 'invoice' && <th className="px-2 py-2 text-right font-medium">Unit</th>}
                    <th className="px-4 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {lineItems.map((li, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2">
                        {li.description}
                        {type === 'receipt' && (
                          <Link
                            href={`/search?q=${encodeURIComponent(li.description)}`}
                            className="ml-2 whitespace-nowrap text-xs font-medium text-indigo-400 hover:text-indigo-300"
                          >
                            Find in store →
                          </Link>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">{li.quantity}</td>
                      {type === 'invoice' && <td className="px-2 py-2 text-right">{money(li.unit_price, currency)}</td>}
                      <td className="px-4 py-2 text-right">{money(li.amount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="text-slate-300">
                  {typeof data.subtotal === 'number' && (
                    <tr>
                      <td colSpan={type === 'invoice' ? 3 : 2} className="px-4 py-1 text-right text-xs text-slate-500">Subtotal</td>
                      <td className="px-4 py-1 text-right">{money(data.subtotal, currency)}</td>
                    </tr>
                  )}
                  {typeof data.tax === 'number' && (
                    <tr>
                      <td colSpan={type === 'invoice' ? 3 : 2} className="px-4 py-1 text-right text-xs text-slate-500">Tax</td>
                      <td className="px-4 py-1 text-right">{money(data.tax, currency)}</td>
                    </tr>
                  )}
                  <tr className="font-semibold text-slate-100">
                    <td colSpan={type === 'invoice' ? 3 : 2} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-slate-400">Total</td>
                    <td className="px-4 py-2 text-right">{money(data.total, currency)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Specs + features (datasheet) */}
          {type === 'datasheet' && (
            <>
              <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/60">
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-slate-800">
                    {specs.map((s, i) => (
                      <tr key={i}>
                        <th className="w-2/5 px-4 py-2 font-medium text-slate-400">{s.name}</th>
                        <td className="px-4 py-2 text-slate-100">{s.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {features.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {features.map((f) => (
                    <span key={f} className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs text-slate-200">
                      {f}
                    </span>
                  ))}
                </div>
              )}
              <Link
                href={`/search?q=${encodeURIComponent(String(data.product_name ?? ''))}`}
                className="inline-block text-sm font-semibold text-indigo-400 hover:text-indigo-300"
              >
                Search the store for this product →
              </Link>
            </>
          )}

          {/* Raw JSON */}
          <details className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-300">Raw JSON</summary>
            <button
              onClick={() => void copyJson()}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-slate-800"
            >
              <FiCopy aria-hidden /> {copied ? 'Copied' : 'Copy JSON'}
            </button>
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
              {JSON.stringify({ type: result.type, data: result.data }, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
