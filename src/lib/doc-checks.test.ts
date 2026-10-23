import { describe, expect, it } from 'vitest';
import { checkDatasheet, checkInvoice, checkReceipt, scoreConfidence } from './doc-checks';
import type { Datasheet, Invoice, Receipt } from './doc-schemas';

const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  vendor: 'Acme',
  invoice_number: 'A-1',
  invoice_date: '2025-03-14',
  due_date: '2025-04-13',
  currency: 'USD',
  line_items: [
    { description: 'Chair', quantity: 2, unit_price: 189, amount: 378 },
    { description: 'Dock', quantity: 3, unit_price: 79.99, amount: 239.97 },
  ],
  subtotal: 617.97,
  tax: 49.44,
  total: 667.41,
  ...over,
});

describe('checkInvoice', () => {
  it('finds nothing wrong with consistent numbers', () => {
    expect(checkInvoice(invoice())).toEqual([]);
  });

  it('flags line items that do not add up to the subtotal', () => {
    const checks = checkInvoice(invoice({ subtotal: 700 }));
    expect(checks.map((c) => c.code)).toContain('subtotal_mismatch');
    expect(checks.find((c) => c.code === 'subtotal_mismatch')?.severity).toBe('error');
  });

  it('flags subtotal + tax that does not equal the total', () => {
    const checks = checkInvoice(invoice({ total: 999 }));
    expect(checks.map((c) => c.code)).toContain('total_mismatch');
  });

  it('flags quantity × unit price that disagrees with the line amount', () => {
    const checks = checkInvoice(
      invoice({ line_items: [{ description: 'Chair', quantity: 2, unit_price: 189, amount: 400 }], subtotal: 400, tax: 0, total: 400 })
    );
    expect(checks.map((c) => c.code)).toEqual(['line_math']);
  });

  it('tolerates a one-cent rounding difference', () => {
    expect(checkInvoice(invoice({ total: 667.42 }))).toEqual([]);
  });

  it('warns when the due date precedes the invoice date', () => {
    const checks = checkInvoice(invoice({ due_date: '2025-01-01' }));
    expect(checks.map((c) => c.code)).toContain('due_before_invoice');
  });

  it('falls back to total − tax when there is no subtotal', () => {
    expect(checkInvoice(invoice({ subtotal: null })).map((c) => c.code)).toEqual([]);
    expect(checkInvoice(invoice({ subtotal: null, total: 5000 })).map((c) => c.code)).toContain('items_vs_total');
  });
});

describe('checkReceipt', () => {
  const receipt = (over: Partial<Receipt> = {}): Receipt => ({
    merchant: 'Corner Cafe',
    date: '2025-05-03',
    currency: 'USD',
    line_items: [
      { description: 'Latte', quantity: 2, amount: 9 },
      { description: 'Croissant', quantity: 1, amount: 3.5 },
    ],
    subtotal: 12.5,
    tax: 1,
    total: 13.5,
    payment_method: null,
    ...over,
  });

  it('accepts a consistent receipt', () => {
    expect(checkReceipt(receipt())).toEqual([]);
  });

  it('catches a misread digit in the total', () => {
    expect(checkReceipt(receipt({ total: 18.5 })).map((c) => c.code)).toContain('total_mismatch');
  });

  it('warns on a missing date', () => {
    expect(checkReceipt(receipt({ date: null })).map((c) => c.code)).toContain('missing_date');
  });
});

describe('checkDatasheet', () => {
  const sheet = (over: Partial<Datasheet> = {}): Datasheet => ({
    product_name: 'Aurora X1',
    manufacturer: 'Lumen',
    model: 'AX1',
    category: 'Phone',
    price: 649,
    currency: 'USD',
    specs: [{ name: 'Weight', value: '186 g' }],
    features: [],
    ...over,
  });

  it('accepts a normal datasheet, including one with no price', () => {
    expect(checkDatasheet(sheet())).toEqual([]);
    expect(checkDatasheet(sheet({ price: null, currency: null }))).toEqual([]);
  });

  it('warns about a price with no currency and about duplicate spec names', () => {
    expect(checkDatasheet(sheet({ currency: null })).map((c) => c.code)).toContain('price_no_currency');
    const dup = sheet({ specs: [{ name: 'Weight', value: '1' }, { name: 'weight', value: '2' }] });
    expect(checkDatasheet(dup).map((c) => c.code)).toContain('duplicate_specs');
  });
});

describe('scoreConfidence', () => {
  it('is 1.0 with no problems', () => {
    expect(scoreConfidence([], false)).toEqual({ confidence: 1, needsReview: false });
  });

  it('forces review when any check is an error', () => {
    const r = scoreConfidence([{ code: 'x', message: 'm', severity: 'error' }], false);
    expect(r.needsReview).toBe(true);
    expect(r.confidence).toBe(0.7);
  });

  it('does not force review for a single warning', () => {
    const r = scoreConfidence([{ code: 'x', message: 'm', severity: 'warn' }], false);
    expect(r).toEqual({ confidence: 0.9, needsReview: false });
  });

  it('lowers confidence when the model needed a repair retry', () => {
    expect(scoreConfidence([], true).confidence).toBe(0.85);
  });

  it('never goes below zero', () => {
    const many = Array.from({ length: 6 }, () => ({ code: 'x', message: 'm', severity: 'error' as const }));
    expect(scoreConfidence(many, true).confidence).toBe(0);
  });
});
