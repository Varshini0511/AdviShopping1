// src/lib/doc-schemas.ts
//
// Schemas for the three document types the extractor understands:
//   invoice · receipt · datasheet (product spec sheet)
//
// A model's JSON is only a *proposal*. Every field is validated against these
// schemas, and the schemas also NORMALISE the usual mess — "$1,234.50" becomes
// 1234.5, "March 5, 2025" becomes "2025-03-05", "€" becomes "EUR" — so a
// near-miss from the model doesn't turn into a failed extraction.

import { z } from 'zod';

// ---- coercion helpers -----------------------------------------------------

/**
 * "$1,234.50" → 1234.5, and the European "1.234,50" → 1234.5. Anything that is
 * not a string passes through unchanged.
 *
 * A comma is the DECIMAL separator when it is the last separator and is followed
 * by one or two digits ("12,50", "1.234,50"); otherwise it is a thousands
 * separator ("1,234", "1,234.50").
 */
export function toNumber(v: unknown): unknown {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const s = v.replace(/[^0-9.,\-]/g, '');
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    const decimalsAfterComma = s.length - lastComma - 1;
    const commaIsDecimal = lastComma > lastDot && decimalsAfterComma >= 1 && decimalsAfterComma <= 2;
    const cleaned = commaIsDecimal ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return undefined;
    return Number(cleaned);
  }
  return v;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Accepts ISO dates as-is; tries to parse other formats; null for empty. */
export function toIsoDate(v: unknown): unknown {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s; // leave it; validation will reject it
  // Local components, not toISOString(): that would shift the day in some time zones.
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP', '₹': 'INR', '¥': 'JPY' };

export function toCurrency(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  return CURRENCY_SYMBOLS[s] ?? s.toUpperCase();
}

// ---- primitives -----------------------------------------------------------

const money = z.preprocess(toNumber, z.number());
const moneyOrNull = z.preprocess((v) => (v == null || v === '' ? null : toNumber(v)), z.number().nullable());
const quantity = z.preprocess((v) => (v == null || v === '' ? 1 : toNumber(v)), z.number());
const isoDate = z.preprocess(toIsoDate, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'));
const isoDateOrNull = z.preprocess(
  toIsoDate,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD').nullable()
);
const currency = z.preprocess(toCurrency, z.string().regex(/^[A-Z]{3}$/, 'must be a 3-letter ISO code'));
const currencyOrNull = z.preprocess(
  (v) => (v == null || v === '' ? null : toCurrency(v)),
  z.string().regex(/^[A-Z]{3}$/, 'must be a 3-letter ISO code').nullable()
);
const text = z.preprocess((v) => (v == null ? v : String(v).trim()), z.string().min(1));
const textOrNull = z.preprocess(
  (v) => (v == null || String(v).trim() === '' ? null : String(v).trim()),
  z.string().nullable()
);

// ---- the three document types --------------------------------------------

export const invoiceSchema = z.object({
  vendor: text,
  invoice_number: text,
  invoice_date: isoDate,
  due_date: isoDateOrNull,
  currency,
  line_items: z
    .array(z.object({ description: text, quantity, unit_price: moneyOrNull, amount: money }))
    .min(1, 'at least one line item'),
  subtotal: moneyOrNull,
  tax: moneyOrNull,
  total: money,
});

export const receiptSchema = z.object({
  merchant: text,
  date: isoDateOrNull,
  currency,
  line_items: z.array(z.object({ description: text, quantity, amount: money })).min(1, 'at least one line item'),
  subtotal: moneyOrNull,
  tax: moneyOrNull,
  total: money,
  payment_method: textOrNull,
});

export const datasheetSchema = z.object({
  product_name: text,
  manufacturer: textOrNull,
  model: textOrNull,
  category: textOrNull,
  price: moneyOrNull,
  currency: currencyOrNull,
  specs: z.array(z.object({ name: text, value: text })).min(1, 'at least one spec'),
  features: z.preprocess((v) => v ?? [], z.array(text)),
});

export const DOC_TYPES = ['invoice', 'receipt', 'datasheet'] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const schemas = {
  invoice: invoiceSchema,
  receipt: receiptSchema,
  datasheet: datasheetSchema,
} as const;

export type Invoice = z.output<typeof invoiceSchema>;
export type Receipt = z.output<typeof receiptSchema>;
export type Datasheet = z.output<typeof datasheetSchema>;
export type ExtractedData = Invoice | Receipt | Datasheet;

export function isDocType(v: unknown): v is DocType {
  return typeof v === 'string' && (DOC_TYPES as readonly string[]).includes(v);
}

/** Zod issues → short strings the model can act on when asked to repair its output. */
export function formatIssues(error: z.ZodError, max = 8): string[] {
  return error.issues.slice(0, max).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
}
