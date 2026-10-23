import { describe, expect, it } from 'vitest';
import {
  datasheetSchema,
  invoiceSchema,
  receiptSchema,
  toCurrency,
  toIsoDate,
  toNumber,
} from './doc-schemas';

describe('toNumber', () => {
  it('parses US-formatted money', () => {
    expect(toNumber('$1,234.50')).toBe(1234.5);
    expect(toNumber('1,234')).toBe(1234); // 3 digits after the comma = thousands
    expect(toNumber('€ 99')).toBe(99);
  });

  it('parses European-formatted money', () => {
    expect(toNumber('1.234,50')).toBe(1234.5);
    expect(toNumber('12,50')).toBe(12.5);
    expect(toNumber('2.130,10 EUR')).toBe(2130.1);
  });

  it('passes numbers through and rejects junk', () => {
    expect(toNumber(42)).toBe(42);
    expect(toNumber('n/a')).toBeUndefined();
    expect(toNumber('')).toBeUndefined();
  });
});

describe('toIsoDate', () => {
  it('keeps ISO dates unchanged', () => {
    expect(toIsoDate('2025-03-14')).toBe('2025-03-14');
  });

  it('normalises other formats without shifting the day', () => {
    expect(toIsoDate('March 5, 2025')).toBe('2025-03-05');
    expect(toIsoDate('14 March 2025')).toBe('2025-03-14');
  });

  it('maps empty to null and leaves garbage for validation to reject', () => {
    expect(toIsoDate('')).toBeNull();
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate('not a date')).toBe('not a date');
  });
});

describe('toCurrency', () => {
  it('maps symbols and upper-cases codes', () => {
    expect(toCurrency('$')).toBe('USD');
    expect(toCurrency('€')).toBe('EUR');
    expect(toCurrency('£')).toBe('GBP');
    expect(toCurrency('eur')).toBe('EUR');
  });
});

const baseInvoice = {
  vendor: 'Acme',
  invoice_number: 'A-1',
  invoice_date: '2025-03-14',
  due_date: null,
  currency: '$',
  line_items: [{ description: 'Widget', quantity: '2', unit_price: '$10.00', amount: '20.00' }],
  subtotal: '20.00',
  tax: null,
  total: '$20.00',
};

describe('invoiceSchema', () => {
  it('coerces strings into numbers and normalises the currency', () => {
    const parsed = invoiceSchema.parse(baseInvoice);
    expect(parsed.currency).toBe('USD');
    expect(parsed.line_items[0]).toEqual({ description: 'Widget', quantity: 2, unit_price: 10, amount: 20 });
    expect(parsed.total).toBe(20);
    expect(parsed.tax).toBeNull();
  });

  it('rejects an invoice with no line items', () => {
    expect(invoiceSchema.safeParse({ ...baseInvoice, line_items: [] }).success).toBe(false);
  });

  it('rejects an unparseable date', () => {
    expect(invoiceSchema.safeParse({ ...baseInvoice, invoice_date: 'sometime' }).success).toBe(false);
  });
});

describe('receiptSchema', () => {
  it('accepts a receipt with no tax and no payment method', () => {
    const parsed = receiptSchema.parse({
      merchant: 'Corner Cafe',
      date: 'May 3, 2025',
      currency: 'USD',
      line_items: [{ description: 'Latte', quantity: 2, amount: 9 }],
      total: 9,
    });
    expect(parsed.date).toBe('2025-05-03');
    expect(parsed.tax).toBeNull();
    expect(parsed.payment_method).toBeNull();
  });

  it('defaults a missing quantity to 1', () => {
    const parsed = receiptSchema.parse({
      merchant: 'M',
      date: null,
      currency: 'USD',
      line_items: [{ description: 'Eggs', amount: 5.1 }],
      total: 5.1,
    });
    expect(parsed.line_items[0].quantity).toBe(1);
  });
});

describe('datasheetSchema', () => {
  it('allows a missing price and defaults features to an empty list', () => {
    const parsed = datasheetSchema.parse({
      product_name: 'Headphones',
      specs: [{ name: 'Weight', value: 265 }],
    });
    expect(parsed.price).toBeNull();
    expect(parsed.features).toEqual([]);
    expect(parsed.specs[0].value).toBe('265'); // numbers become strings
  });

  it('requires at least one spec', () => {
    expect(datasheetSchema.safeParse({ product_name: 'X', specs: [] }).success).toBe(false);
  });
});
