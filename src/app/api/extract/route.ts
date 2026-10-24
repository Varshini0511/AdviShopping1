// src/app/api/extract/route.ts
//
// POST a document (multipart field "file") → { type, data, confidence, needsReview, checks, … }
//
// Accepts: PDF with a text layer, PNG / JPEG / WebP photos or screenshots, plain text.
// The file is processed in memory and never stored.
//
// This endpoint is public and every call spends model quota, so it has the same
// guards as the other public endpoints: a per-IP rate limit, a size cap checked
// from Content-Length before the body is buffered, and — because the declared
// MIME type is client-controlled — a check of the file's actual leading bytes.

import { NextResponse } from 'next/server';
import { extractDocument, RateLimitedError, UpstreamUnavailableError, type ExtractInput } from '@/lib/doc-extract';
import { DocumentError, pdfToText } from '@/lib/pdf-text';
import { rateLimit, clientIp, tooManyRequests } from '@/lib/rate-limit';
import { IMAGE_MIME, isImageKind, sniffFileKind } from '@/lib/file-sniff';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const REQUESTS_PER_MINUTE = 6;
const MAX_TEXT_CHARS = 12_000;

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(request: Request) {
  const limited = rateLimit(`extract:${clientIp(request)}`, REQUESTS_PER_MINUTE, 60_000);
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);

  if (!process.env.GROQ_API_KEY) {
    return fail('Document extraction is not configured (missing GROQ_API_KEY).', 503);
  }

  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return fail(`File is too large. The maximum size is ${MAX_BYTES / 1024 / 1024} MB.`, 413);
  }

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof Blob) || file.size === 0) return fail('No file provided.', 400);
    if (file.size > MAX_BYTES) {
      return fail(`File is too large. The maximum size is ${MAX_BYTES / 1024 / 1024} MB.`, 413);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffFileKind(bytes);
    if (!kind) return fail('Unsupported file. Upload a PDF, a PNG/JPG/WebP image, or a text file.', 415);

    let input: ExtractInput | undefined;
    if (kind === 'pdf') {
      input = { kind: 'text', text: await pdfToText(bytes) };
    } else if (kind === 'text') {
      input = { kind: 'text', text: new TextDecoder().decode(bytes).slice(0, MAX_TEXT_CHARS) };
    } else if (isImageKind(kind)) {
      input = {
        kind: 'image',
        dataUrl: `data:${IMAGE_MIME[kind]};base64,${Buffer.from(bytes).toString('base64')}`,
      };
    }

    if (!input) return fail('Unsupported file.', 415);
    const result = await extractDocument(input);
    console.log(
      `[extract] ${kind} → ${result.type} conf=${result.confidence} review=${result.needsReview} ` +
        `attempts=${result.attempts} tokens(in/out)=${result.tokens.prompt}/${result.tokens.completion}`
    );
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof DocumentError) return fail(e.message, 422);
    if (e instanceof RateLimitedError) {
      return NextResponse.json(
        { error: `The model is busy right now (free-tier limit). Please try again in ${e.retryAfterSec}s.` },
        { status: 429, headers: { 'Retry-After': String(e.retryAfterSec) } }
      );
    }
    if (e instanceof UpstreamUnavailableError) {
      return NextResponse.json(
        { error: 'The AI model is temporarily unavailable (provider overloaded). Please try again in a minute.' },
        { status: 503, headers: { 'Retry-After': '60' } }
      );
    }
    console.error('[extract] failed:', e);
    return fail('Extraction failed.', 500);
  }
}
