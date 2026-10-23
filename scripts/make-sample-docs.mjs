// scripts/make-sample-docs.mjs
//
// Generates the labelled evaluation set for document extraction:
//   3 invoices (PDF)  ·  3 receipts (PNG)  ·  3 product datasheets (PDF)
// plus a ground-truth `<name>.expected.json` next to each, written to eval/docs/.
// The first of each type is also copied to public/samples/ for the /extract page.
//
// The documents are synthetic but deliberately varied — different layouts,
// currencies ($ € £), number formats (1,234.50 vs 1.234,50), date styles, a
// receipt with no tax line, a datasheet with no price — so the evaluation isn't
// just the easy case. Re-run any time:   npm run extract:samples

import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import sharp from 'sharp';

const OUT = path.resolve('eval/docs');
const PUBLIC = path.resolve('public/samples');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PUBLIC, { recursive: true });

const writeExpected = (name, obj) =>
  fs.writeFileSync(path.join(OUT, `${name}.expected.json`), JSON.stringify(obj, null, 2) + '\n');

// ---------- number formatting -------------------------------------------------
const us = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eu = (n) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- PDF helpers -------------------------------------------------------
async function pdf(draw) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.1, 0.12);
  const t = (s, x, y, { size = 10.5, f = font } = {}) => page.drawText(String(s), { x, y, size, font: f, color: ink });
  const right = (s, xr, y, { size = 10.5, f = font } = {}) =>
    page.drawText(String(s), { x: xr - f.widthOfTextAtSize(String(s), size), y, size, font: f, color: ink });
  const rule = (y) => page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.6, color: rgb(0.6, 0.6, 0.6) });
  draw({ t, right, rule, bold });
  return Buffer.from(await doc.save());
}

// ---------- INVOICES ----------------------------------------------------------
const invoices = [
  {
    name: 'invoice-1',
    vendor: 'Northwind Supplies Ltd',
    number: 'INV-2025-0412',
    dateText: '14 March 2025',
    dueText: 'April 13, 2025',
    fmt: (n) => `$${us(n)}`,
    items: [
      ['Ergonomic office chair', 2, 189.0],
      ['Standing desk converter', 1, 249.5],
      ['USB-C docking station', 3, 79.99],
    ],
    taxLabel: 'Sales tax (8%)',
    taxRate: 0.08,
    expected: { invoice_date: '2025-03-14', due_date: '2025-04-13', currency: 'USD' },
  },
  {
    name: 'invoice-2',
    vendor: 'Bluewave Consulting GmbH',
    number: 'RE-7781',
    dateText: '2 June 2025',
    dueText: null,
    fmt: (n) => `${eu(n)} EUR`, // European number format: 1.140,00
    items: [
      ['Data pipeline audit (hours)', 12, 95.0],
      ['Workshop facilitation', 1, 650.0],
    ],
    taxLabel: 'VAT (19%)',
    taxRate: 0.19,
    expected: { invoice_date: '2025-06-02', due_date: null, currency: 'EUR' },
  },
  {
    name: 'invoice-3',
    vendor: 'Harbor Freight Logistics',
    number: 'HFL-30019',
    dateText: '2025-09-21',
    dueText: '2025-10-21',
    fmt: (n) => `$${us(n)}`,
    items: [
      ['Pallet shipping - Zone 3', 4, 112.4],
      ['Fuel surcharge', 1, 38.25],
      ['Liftgate service', 2, 25.0],
      ['Insurance (declared value)', 1, 17.8],
      ['Residential delivery fee', 3, 9.5],
    ],
    taxLabel: null, // no tax shown on this invoice
    taxRate: 0,
    expected: { invoice_date: '2025-09-21', due_date: '2025-10-21', currency: 'USD' },
  },
  {
    // TRAP: the document itself is wrong. The true total is 435.51, but the
    // printed total has two digits transposed (453.51). A faithful extraction
    // must report what is printed AND be flagged for review, because
    // subtotal + tax does not equal the total. Tests the confidence logic.
    name: 'invoice-trap',
    vendor: 'Summit Office Supply',
    number: 'INV-9921',
    dateText: '8 August 2025',
    dueText: 'September 7, 2025',
    fmt: (n) => `${us(n)}`,
    items: [
      ['Printer paper (case)', 5, 42.0],
      ['Toner cartridge', 2, 89.5],
      ['Heavy-duty stapler', 1, 14.25],
    ],
    taxLabel: 'Sales tax (8%)',
    taxRate: 0.08,
    printedTotal: 453.51, // true total would be 435.51
    expectReview: true,
    expected: { invoice_date: '2025-08-08', due_date: '2025-09-07', currency: 'USD' },
  },
];

for (const inv of invoices) {
  const lines = inv.items.map(([d, q, u]) => ({ description: d, quantity: q, unit_price: u, amount: Number((q * u).toFixed(2)) }));
  const subtotal = Number(lines.reduce((s, l) => s + l.amount, 0).toFixed(2));
  const tax = inv.taxLabel ? Number((subtotal * inv.taxRate).toFixed(2)) : null;
  const total = inv.printedTotal ?? Number((subtotal + (tax ?? 0)).toFixed(2));

  const bytes = await pdf(({ t, right, rule, bold }) => {
    t(inv.vendor, 50, 790, { size: 20, f: bold });
    right('INVOICE', 545, 790, { size: 18, f: bold });
    t(`Invoice No: ${inv.number}`, 50, 745);
    t(`Invoice Date: ${inv.dateText}`, 50, 730);
    if (inv.dueText) t(`Payment due: ${inv.dueText}`, 50, 715);
    t('Description', 50, 670, { f: bold });
    t('Qty', 340, 670, { f: bold });
    right('Unit price', 450, 670, { f: bold });
    right('Amount', 545, 670, { f: bold });
    rule(662);
    let y = 645;
    for (const l of lines) {
      t(l.description, 50, y);
      t(l.quantity, 340, y);
      right(inv.fmt(l.unit_price), 450, y);
      right(inv.fmt(l.amount), 545, y);
      y -= 20;
    }
    rule(y + 8);
    y -= 14;
    right('Subtotal', 450, y);
    right(inv.fmt(subtotal), 545, y);
    if (inv.taxLabel) {
      y -= 18;
      right(inv.taxLabel, 450, y);
      right(inv.fmt(tax), 545, y);
    }
    y -= 22;
    right('TOTAL DUE', 450, y, { f: bold, size: 12 });
    right(inv.fmt(total), 545, y, { f: bold, size: 12 });
    t('Thank you for your business.', 50, 90, { size: 9 });
  });

  fs.writeFileSync(path.join(OUT, `${inv.name}.pdf`), bytes);
  writeExpected(inv.name, {
    type: 'invoice',
    ...(inv.expectReview ? { expect_review: true } : {}),
    data: {
      vendor: inv.vendor,
      invoice_number: inv.number,
      ...inv.expected,
      line_items: lines,
      subtotal,
      tax,
      total,
    },
  });
}

// ---------- RECEIPTS ----------------------------------------------------------
const receipts = [
  {
    name: 'receipt-1',
    merchant: 'CORNER CAFE',
    address: '123 Market Street',
    dateText: 'May 3, 2025  14:32',
    sym: '$',
    items: [
      ['Latte', 2, 9.0, 'Latte x2'],
      ['Croissant', 1, 3.5, 'Croissant x1'],
    ],
    taxLabel: 'Tax',
    tax: 1.0,
    payment: 'VISA ****4242',
    expected: { date: '2025-05-03', currency: 'USD', payment_method: 'VISA ****4242' },
  },
  {
    name: 'receipt-2',
    merchant: 'GREENLEAF GROCERS',
    address: '88 Orchard Road',
    dateText: '19 Jul 2025  09:07',
    sym: '$',
    items: [
      ['Bananas 1.2kg', 1, 1.8, 'Bananas 1.2kg'],
      ['Oat milk', 2, 6.4, 'Oat milk x2'],
      ['Sourdough loaf', 1, 4.25, 'Sourdough loaf'],
      ['Free-range eggs', 1, 5.1, 'Free-range eggs'],
      ['Basil plant', 1, 3.99, 'Basil plant'],
    ],
    taxLabel: null, // groceries: no tax line
    tax: null,
    payment: 'CASH',
    expected: { date: '2025-07-19', currency: 'USD', payment_method: 'CASH' },
  },
  {
    name: 'receipt-3',
    merchant: 'Pixel & Print Studio',
    address: '14 Kings Parade',
    dateText: '2 Oct 2025',
    sym: '£',
    items: [
      ['Poster print A2', 3, 36.0, 'Poster print A2 x3'],
      ['Mounting board', 2, 11.0, 'Mounting board x2'],
    ],
    taxLabel: 'VAT 20%',
    tax: 9.4,
    payment: 'MASTERCARD ****1881',
    expected: { date: '2025-10-02', currency: 'GBP', payment_method: 'MASTERCARD ****1881' },
  },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

for (const r of receipts) {
  const lines = r.items.map(([d, q, amt]) => ({ description: d, quantity: q, amount: amt }));
  const subtotal = Number(lines.reduce((s, l) => s + l.amount, 0).toFixed(2));
  const total = Number((subtotal + (r.tax ?? 0)).toFixed(2));
  const W = 420;
  const L = 24;
  const R = W - 24;
  const rows = [];
  let y = 46;
  const text = (s, { x = L, anchor = 'start', size = 20, weight = 'normal' } = {}) => {
    rows.push(`<text x="${anchor === 'end' ? R : x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}">${esc(s)}</text>`);
  };
  const pair = (label, value, weight = 'normal') => {
    rows.push(`<text x="${L}" y="${y}" font-size="20" font-weight="${weight}">${esc(label)}</text>`);
    rows.push(`<text x="${R}" y="${y}" text-anchor="end" font-size="20" font-weight="${weight}">${esc(value)}</text>`);
  };
  text(r.merchant, { size: 28, weight: 'bold' });
  y += 28;
  text(r.address, { size: 17 });
  y += 24;
  text(r.dateText, { size: 17 });
  y += 26;
  text('-'.repeat(34), { size: 17 });
  y += 28;
  for (const [, , amt, label] of r.items) {
    pair(label, `${amt.toFixed(2)}`);
    y += 28;
  }
  text('-'.repeat(34), { size: 17 });
  y += 28;
  pair('Subtotal', subtotal.toFixed(2));
  y += 28;
  if (r.taxLabel) {
    pair(r.taxLabel, r.tax.toFixed(2));
    y += 28;
  }
  pair(`TOTAL ${r.sym}`, total.toFixed(2), 'bold');
  y += 36;
  text(r.payment, { size: 18 });
  y += 28;
  text('Thank you!', { size: 17 });
  const H = y + 24;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fbfbf8"/><g font-family="Courier New, Courier, monospace" fill="#1a1a1a">${rows.join('')}</g></svg>`;
  const png = await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();

  fs.writeFileSync(path.join(OUT, `${r.name}.png`), png);
  const expectedReceipt = {
    type: 'receipt',
    data: { merchant: r.merchant, ...r.expected, line_items: lines, subtotal, tax: r.tax, total },
  };
  writeExpected(r.name, expectedReceipt);

  // A deliberately bad "phone photo" of the same receipt: shrunk to ~40%,
  // blurred, rotated 2 degrees, and heavily JPEG-compressed. Same ground truth.
  // This is the stress test: does accuracy drop, and does the system notice?
  const meta = await sharp(png).metadata();
  const noisy = await sharp(png)
    .resize({ width: Math.round(meta.width * 0.4) })
    .blur(0.9)
    .rotate(2, { background: '#fbfbf8' })
    .jpeg({ quality: 35 })
    .toBuffer();
  fs.writeFileSync(path.join(OUT, `${r.name}-noisy.jpg`), noisy);
  writeExpected(`${r.name}-noisy`, expectedReceipt);
}

// ---------- PRODUCT DATASHEETS ------------------------------------------------
const datasheets = [
  {
    name: 'datasheet-1',
    product: 'Aurora X1 Smartphone',
    maker: 'Lumen Mobile',
    model: 'AX1-256',
    category: 'Smartphone',
    priceText: 'MSRP: $649.00',
    price: 649.0,
    currency: 'USD',
    specs: [
      ['Display', '6.4-inch AMOLED, 120 Hz'],
      ['Processor', 'OctaCore 3.1 GHz'],
      ['Memory', '8 GB RAM / 256 GB storage'],
      ['Camera', '50 MP main + 12 MP ultrawide'],
      ['Battery', '4,800 mAh'],
      ['Weight', '186 g'],
    ],
    features: ['Fast charging 45 W', 'IP68 water resistance', '5G'],
  },
  {
    name: 'datasheet-2',
    product: 'Zephyr 14 Ultrabook',
    maker: 'Nimbus Computing',
    model: 'ZP14-R7',
    category: 'Laptop',
    priceText: 'Price: $1,199.00',
    price: 1199.0,
    currency: 'USD',
    specs: [
      ['Display', '14-inch IPS, 2.8K'],
      ['Processor', 'Ryzen 7 7840U'],
      ['Memory', '16 GB LPDDR5 / 1 TB SSD'],
      ['Battery', 'Up to 18 hours'],
      ['Weight', '1.2 kg'],
      ['Ports', '2x USB-C, 1x HDMI, headphone jack'],
    ],
    features: ['Backlit keyboard', 'Fingerprint reader'],
  },
  {
    name: 'datasheet-3',
    product: 'Studio Pro ANC Headphones',
    maker: 'Sonique Audio',
    model: 'SP-700',
    category: 'Headphones',
    priceText: 'Price: contact sales', // no price in the document
    price: null,
    currency: null,
    specs: [
      ['Driver', '40 mm dynamic'],
      ['Frequency response', '10 Hz - 40 kHz'],
      ['Battery', '40 hours (ANC on)'],
      ['Connectivity', 'Bluetooth 5.3, 3.5 mm'],
      ['Weight', '265 g'],
    ],
    features: ['Active noise cancellation', 'Multipoint pairing', 'Foldable design'],
  },
];

for (const d of datasheets) {
  const bytes = await pdf(({ t, rule, bold }) => {
    t(d.product, 50, 780, { size: 22, f: bold });
    t(`by ${d.maker}`, 50, 758, { size: 12 });
    t(`Model: ${d.model}`, 50, 730);
    t(`Category: ${d.category}`, 50, 715);
    t(d.priceText, 50, 700);
    rule(690);
    t('Technical specifications', 50, 668, { size: 13, f: bold });
    let y = 646;
    for (const [name, value] of d.specs) {
      t(`${name}:`, 50, y, { f: bold });
      t(value, 190, y);
      y -= 20;
    }
    y -= 14;
    t('Key features', 50, y, { size: 13, f: bold });
    y -= 22;
    for (const f of d.features) {
      t(`- ${f}`, 60, y);
      y -= 18;
    }
  });
  fs.writeFileSync(path.join(OUT, `${d.name}.pdf`), bytes);
  writeExpected(d.name, {
    type: 'datasheet',
    data: {
      product_name: d.product,
      manufacturer: d.maker,
      model: d.model,
      category: d.category,
      price: d.price,
      currency: d.currency,
      specs: d.specs.map(([name, value]) => ({ name, value })),
      features: d.features,
    },
  });
}

// ---------- samples for the UI ------------------------------------------------
fs.copyFileSync(path.join(OUT, 'invoice-1.pdf'), path.join(PUBLIC, 'sample-invoice.pdf'));
fs.copyFileSync(path.join(OUT, 'receipt-1.png'), path.join(PUBLIC, 'sample-receipt.png'));
fs.copyFileSync(path.join(OUT, 'datasheet-1.pdf'), path.join(PUBLIC, 'sample-datasheet.pdf'));
fs.copyFileSync(path.join(OUT, 'invoice-trap.pdf'), path.join(PUBLIC, 'sample-invoice-flagged.pdf'));

console.log(`Wrote ${fs.readdirSync(OUT).length} files to eval/docs/ and 4 samples to public/samples/`);
