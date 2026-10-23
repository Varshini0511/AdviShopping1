// src/lib/pdf-text.ts
//
// Reads the text layer of a PDF (invoices, datasheets exported from software).
// Scanned/photographed PDFs have no text layer — those should be uploaded as an
// image instead, which the vision model reads directly.

import { extractText, getDocumentProxy } from 'unpdf';

const MAX_PAGES = 10;
const MAX_CHARS = 12_000; // keeps the prompt (and token cost) bounded

export class DocumentError extends Error {}

export async function pdfToText(bytes: Uint8Array): Promise<string> {
  let pdf;
  try {
    pdf = await getDocumentProxy(bytes);
  } catch {
    throw new DocumentError('That PDF could not be read. It may be corrupted or password-protected.');
  }
  if (pdf.numPages > MAX_PAGES) {
    throw new DocumentError(`That PDF has ${pdf.numPages} pages; the limit is ${MAX_PAGES}.`);
  }

  const { text } = await extractText(pdf, { mergePages: true });
  const joined = (Array.isArray(text) ? text.join('\n') : text).trim();
  if (joined.length < 20) {
    throw new DocumentError(
      'This PDF has no readable text (it looks scanned). Upload a photo or screenshot of it as a PNG/JPG instead.'
    );
  }
  return joined.slice(0, MAX_CHARS);
}
