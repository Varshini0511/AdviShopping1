// src/lib/doc-checks.ts
//
// Pure (no network, no model) consistency checks on extracted data.
//
// Why: a language model can produce perfectly-formed JSON that is still wrong —
// a digit misread on a receipt, a line item dropped. Documents carry their own
// redundancy though: line items must sum to the subtotal, subtotal + tax must
// equal the total, quantity × unit price must equal the line amount. Checking
// that arithmetic catches many extraction errors WITHOUT needing ground truth,
// and turns "the model said so" into "the numbers agree with each other".

import type { DocType, Invoice, Receipt, Datasheet, ExtractedData } from './doc-schemas';

export type Check = {
  code: string;
  message: string;
  /** 'error' = numbers contradict each other; 'warn' = suspicious but possible. */
  severity: 'error' | 'warn';
};

const TOLERANCE = 0.02; // two cents: rounding on a per-line basis can drift by a cent
const close = (a: number, b: number, tol = TOLERANCE) => Math.abs(a - b) <= tol;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const fmt = (n: number) => n.toFixed(2);

// The money-bearing fields shared by invoices and receipts (receipts have no unit_price).
type MoneyDoc = {
  line_items: { description: string; quantity: number; unit_price?: number | null; amount: number }[];
  subtotal: number | null;
  tax: number | null;
  total: number;
};

function checkTotals(d: MoneyDoc): Check[] {
  const checks: Check[] = [];
  const itemsSum = sum(d.line_items.map((i) => i.amount));

  // quantity × unit price = line amount
  for (const item of d.line_items) {
    if (item.unit_price != null) {
      const expected = item.quantity * item.unit_price;
      if (!close(expected, item.amount, Math.max(TOLERANCE, Math.abs(item.amount) * 0.01))) {
        checks.push({
          code: 'line_math',
          severity: 'warn',
          message: `"${item.description}": ${item.quantity} × ${fmt(item.unit_price)} = ${fmt(expected)}, but the line says ${fmt(item.amount)}.`,
        });
      }
    }
  }

  // line items = subtotal (or, with no subtotal, = total − tax)
  if (d.subtotal != null) {
    if (!close(itemsSum, d.subtotal)) {
      checks.push({
        code: 'subtotal_mismatch',
        severity: 'error',
        message: `Line items add up to ${fmt(itemsSum)}, but the subtotal is ${fmt(d.subtotal)}.`,
      });
    }
  } else {
    const expectedBase = d.total - (d.tax ?? 0);
    if (!close(itemsSum, expectedBase)) {
      checks.push({
        code: 'items_vs_total',
        severity: 'warn',
        message: `Line items add up to ${fmt(itemsSum)}, but total${d.tax != null ? ' − tax' : ''} is ${fmt(expectedBase)}.`,
      });
    }
  }

  // subtotal + tax = total
  if (d.subtotal != null) {
    const expectedTotal = d.subtotal + (d.tax ?? 0);
    if (!close(expectedTotal, d.total)) {
      checks.push({
        code: 'total_mismatch',
        severity: 'error',
        message: `Subtotal ${fmt(d.subtotal)} + tax ${fmt(d.tax ?? 0)} = ${fmt(expectedTotal)}, but the total is ${fmt(d.total)}.`,
      });
    }
  }

  if (d.total < 0) {
    checks.push({ code: 'negative_total', severity: 'warn', message: `The total is negative (${fmt(d.total)}).` });
  }
  return checks;
}

export function checkInvoice(d: Invoice): Check[] {
  const checks = checkTotals(d);
  if (d.due_date && d.due_date < d.invoice_date) {
    checks.push({
      code: 'due_before_invoice',
      severity: 'warn',
      message: `The due date (${d.due_date}) is before the invoice date (${d.invoice_date}).`,
    });
  }
  return checks;
}

export function checkReceipt(d: Receipt): Check[] {
  const checks = checkTotals(d);
  if (d.date == null) {
    checks.push({ code: 'missing_date', severity: 'warn', message: 'No date was found on the receipt.' });
  }
  return checks;
}

export function checkDatasheet(d: Datasheet): Check[] {
  const checks: Check[] = [];
  if (d.price != null && d.price < 0) {
    checks.push({ code: 'negative_price', severity: 'warn', message: `The price is negative (${fmt(d.price)}).` });
  }
  if (d.price != null && !d.currency) {
    checks.push({ code: 'price_no_currency', severity: 'warn', message: 'A price was found but no currency.' });
  }
  const names = d.specs.map((s) => s.name.toLowerCase());
  if (new Set(names).size !== names.length) {
    checks.push({ code: 'duplicate_specs', severity: 'warn', message: 'Some spec names appear more than once.' });
  }
  return checks;
}

export function runChecks(type: DocType, data: ExtractedData): Check[] {
  switch (type) {
    case 'invoice':
      return checkInvoice(data as Invoice);
    case 'receipt':
      return checkReceipt(data as Receipt);
    case 'datasheet':
      return checkDatasheet(data as Datasheet);
  }
}

/**
 * Turn the checks (plus whether the model needed a repair retry) into a single
 * confidence score and a "send to a human" flag.
 *
 * This is a heuristic, not a calibrated probability — but it is honest about
 * what it measures: internal consistency, not correctness against the paper.
 */
export function scoreConfidence(checks: Check[], repaired: boolean): { confidence: number; needsReview: boolean } {
  let confidence = 1;
  for (const c of checks) confidence -= c.severity === 'error' ? 0.3 : 0.1;
  if (repaired) confidence -= 0.15; // the first answer failed validation
  confidence = Math.max(0, Math.min(1, Number(confidence.toFixed(2))));
  const needsReview = confidence < 0.7 || checks.some((c) => c.severity === 'error');
  return { confidence, needsReview };
}
