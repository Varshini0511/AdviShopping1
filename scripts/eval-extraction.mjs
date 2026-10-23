// scripts/eval-extraction.mjs
//
// Scores document extraction against ground truth.
//
//   1. npm run extract:samples                       (generates eval/docs/*)
//   2. start the app:  npm run build && npm start -- -p 3100
//   3. npm run eval:extract                           (BASE_URL / DELAY_SECONDS configurable)
//
// For every eval/docs/<name>.expected.json it uploads the matching PDF/PNG to
// POST /api/extract and compares the answer field by field.
//
// Reported per document type:
//   - type accuracy          did it recognise the document kind?
//   - field accuracy         scalar fields (vendor, dates, totals, …) that match exactly
//   - item / spec F1         line items (invoice, receipt) or specs (datasheet):
//                            precision & recall of matched entries
//   - exact-match rate       documents where EVERYTHING was right
// …and whether the needs-review flag is useful: of the documents that were
// wrong, how many did the system itself flag for a human?
//
// The free Groq tier meters tokens per minute, so documents are spaced out.

import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';
const DELAY_SECONDS = Number(process.env.DELAY_SECONDS ?? 45);
const DIR = path.resolve('eval/docs');

// ---------- comparison helpers ----------------------------------------------
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s) => new Set(norm(s).split(' ').filter(Boolean));
function jaccard(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
const looseText = (a, b) => {
  if (a == null || b == null) return a == null && b == null;
  const x = norm(a);
  const y = norm(b);
  return x === y || x.includes(y) || y.includes(x) || jaccard(a, b) >= 0.6;
};
const sameNum = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= 0.01);
const exactDate = (a, b) => (a ?? null) === (b ?? null);

const SCALARS = {
  invoice: [
    ['vendor', looseText], ['invoice_number', looseText], ['invoice_date', exactDate], ['due_date', exactDate],
    ['currency', exactDate], ['subtotal', sameNum], ['tax', sameNum], ['total', sameNum],
  ],
  receipt: [
    ['merchant', looseText], ['date', exactDate], ['currency', exactDate],
    ['subtotal', sameNum], ['tax', sameNum], ['total', sameNum], ['payment_method', looseText],
  ],
  datasheet: [
    ['product_name', looseText], ['manufacturer', looseText], ['model', looseText],
    ['category', looseText], ['price', sameNum], ['currency', exactDate],
  ],
};

/** Greedy one-to-one matching → precision / recall / F1. */
function matchLists(expected, predicted, isMatch) {
  const used = new Set();
  let tp = 0;
  for (const e of expected) {
    const i = predicted.findIndex((p, idx) => !used.has(idx) && isMatch(e, p));
    if (i >= 0) {
      used.add(i);
      tp++;
    }
  }
  const precision = predicted.length ? tp / predicted.length : expected.length ? 0 : 1;
  const recall = expected.length ? tp / expected.length : 1;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, precision, recall, f1 };
}

const itemMatch = (e, p) => sameNum(e.amount, p.amount) && (looseText(e.description, p.description));
const specMatch = (e, p) => looseText(e.name, p.name) && looseText(e.value, p.value);

function score(type, expected, result) {
  const out = { typeOk: result.type === type, fieldsOk: 0, fieldsTotal: 0, mismatches: [], listF1: null, exact: false };
  if (!out.typeOk || !result.data) {
    out.fieldsTotal = SCALARS[type].length;
    out.listF1 = 0;
    return out;
  }
  for (const [field, cmp] of SCALARS[type]) {
    out.fieldsTotal++;
    if (cmp(expected[field], result.data[field])) out.fieldsOk++;
    else out.mismatches.push(`${field}: expected ${JSON.stringify(expected[field])}, got ${JSON.stringify(result.data[field])}`);
  }
  const list = type === 'datasheet'
    ? matchLists(expected.specs, result.data.specs ?? [], specMatch)
    : matchLists(expected.line_items, result.data.line_items ?? [], itemMatch);
  out.listF1 = list.f1;
  if (list.f1 < 1) out.mismatches.push(`${type === 'datasheet' ? 'specs' : 'line items'}: matched ${list.tp}/${expected[type === 'datasheet' ? 'specs' : 'line_items'].length}, predicted ${(result.data[type === 'datasheet' ? 'specs' : 'line_items'] ?? []).length}`);
  out.exact = out.fieldsOk === out.fieldsTotal && list.f1 === 1;
  return out;
}

// ---------- run -------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg' };

async function extract(file) {
  const bytes = fs.readFileSync(file);
  for (let attempt = 0; attempt < 4; attempt++) {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: MIME[path.extname(file)] }), path.basename(file));
    const started = Date.now();
    const res = await fetch(`${BASE_URL}/api/extract`, { method: 'POST', body: form });
    const ms = Date.now() - started;
    // 429 = our / the provider's rate limit; 503 = provider overloaded. Both are
    // transient and say nothing about extraction quality, so wait and retry
    // rather than scoring them as wrong answers.
    if (res.status === 429 || res.status === 503) {
      const wait = Math.min(Number(res.headers.get('retry-after')) || 20, 60) + 2;
      console.log(`    HTTP ${res.status} (transient) — waiting ${wait}s`);
      await sleep(wait * 1000);
      continue;
    }
    return { status: res.status, body: await res.json(), ms };
  }
  return { status: 429, body: { error: 'still rate limited after retries' }, ms: 0 };
}

const names = fs.readdirSync(DIR).filter((f) => f.endsWith('.expected.json')).map((f) => f.replace('.expected.json', '')).sort();
const rows = [];

console.log(`Evaluating ${names.length} documents against ${BASE_URL} (spacing ${DELAY_SECONDS}s)\n`);
for (let i = 0; i < names.length; i++) {
  const name = names[i];
  const expectedDoc = JSON.parse(fs.readFileSync(path.join(DIR, `${name}.expected.json`), 'utf8'));
  const file = ['.pdf', '.png', '.jpg'].map((e) => path.join(DIR, name + e)).find((p) => fs.existsSync(p));
  const { status, body, ms } = await extract(file);

  let row;
  if (status !== 200 || body.error) {
    row = { name, type: expectedDoc.type, failed: body.error || `HTTP ${status}`, exact: false, flagged: true };
    console.log(`✗ ${name.padEnd(12)} FAILED: ${row.failed}`);
  } else {
    const s = score(expectedDoc.type, expectedDoc.data, body);
    row = {
      name, type: expectedDoc.type, typeOk: s.typeOk, fieldsOk: s.fieldsOk, fieldsTotal: s.fieldsTotal,
      listF1: s.listF1, exact: s.exact, flagged: body.needsReview, confidence: body.confidence,
      attempts: body.attempts, tokens: body.tokens.prompt + body.tokens.completion, ms, mismatches: s.mismatches,
      expectReview: Boolean(expectedDoc.expect_review),
    };
    console.log(
      `${s.exact ? '✓' : '✗'} ${name.padEnd(12)} type=${s.typeOk ? 'ok ' : 'BAD'} fields=${s.fieldsOk}/${s.fieldsTotal} ` +
      `list-F1=${s.listF1.toFixed(2)} conf=${body.confidence} review=${body.needsReview ? 'YES' : 'no '} ` +
      `calls=${body.attempts} ${(ms / 1000).toFixed(1)}s`
    );
    for (const m of s.mismatches) console.log(`      - ${m}`);
  }
  rows.push(row);
  if (i < names.length - 1) await sleep(DELAY_SECONDS * 1000);
}

// ---------- summary ---------------------------------------------------------
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
const ok = rows.filter((r) => !r.failed);
console.log('\n=== Summary by document type ===');
console.log('type        docs  type-acc  field-acc  list-F1  exact');
const byType = {};
for (const t of ['invoice', 'receipt', 'datasheet']) {
  const rs = rows.filter((r) => r.type === t);
  const good = rs.filter((r) => !r.failed);
  const fieldsOk = good.reduce((s, r) => s + r.fieldsOk, 0);
  const fieldsTotal = rs.reduce((s, r) => s + (r.fieldsTotal ?? 0), 0) || 1;
  const f1 = good.length ? good.reduce((s, r) => s + r.listF1, 0) / rs.length : 0;
  byType[t] = {
    docs: rs.length,
    typeAcc: pct(good.filter((r) => r.typeOk).length, rs.length),
    fieldAcc: pct(fieldsOk, fieldsTotal),
    listF1: f1.toFixed(2),
    exact: `${rs.filter((r) => r.exact).length}/${rs.length}`,
  };
  const b = byType[t];
  console.log(`${t.padEnd(10)}  ${String(b.docs).padEnd(4)}  ${b.typeAcc.padEnd(8)}  ${b.fieldAcc.padEnd(9)}  ${b.listF1.padEnd(7)}  ${b.exact}`);
}

// A document is a "problem" if the extraction was wrong OR the source document is
// itself inconsistent (trap docs, expect_review). The system should flag problems
// for a human and leave clean documents alone.
const wrong = rows.filter((r) => !r.exact || r.expectReview);
const right = rows.filter((r) => r.exact && !r.expectReview);
const overall = {
  documents: rows.length,
  exactMatch: `${rows.filter((r) => r.exact).length}/${rows.length}`, // extraction matched ground truth (the trap doc counts: reading it faithfully IS correct)
  repairRate: pct(ok.filter((r) => r.attempts > 1).length, ok.length),
  avgSeconds: ok.length ? (ok.reduce((s, r) => s + r.ms, 0) / ok.length / 1000).toFixed(1) : 'n/a',
  avgTokens: ok.length ? Math.round(ok.reduce((s, r) => s + r.tokens, 0) / ok.length) : 'n/a',
  wrongButFlagged: `${wrong.filter((r) => r.flagged).length}/${wrong.length}`,
  rightButFlagged: `${right.filter((r) => r.flagged).length}/${right.length}`,
};
console.log('\n=== Overall ===');
console.log(`documents fully correct : ${overall.exactMatch}`);
console.log(`needed a repair retry   : ${overall.repairRate}`);
console.log(`avg latency / doc       : ${overall.avgSeconds}s   avg tokens / doc: ${overall.avgTokens}`);
console.log(`problem documents flagged for review : ${overall.wrongButFlagged}   (wrong extraction or inconsistent source; higher is better)`);
console.log(`correct answers flagged (false alarms): ${overall.rightButFlagged}   (lower is better)`);

fs.writeFileSync(
  path.resolve('eval/results.json'),
  JSON.stringify({ ranAt: new Date().toISOString(), baseUrl: BASE_URL, byType, overall, documents: rows }, null, 2) + '\n'
);
console.log('\nWrote eval/results.json');
