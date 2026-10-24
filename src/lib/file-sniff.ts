// src/lib/file-sniff.ts
//
// Decide what an uploaded file REALLY is from its leading bytes.
//
// A browser (or an attacker) chooses the MIME type it declares, and file names
// can be anything. Image/PDF libraries, however, decode by CONTENT — so a file
// that is really an SVG or HEIF but is labelled "image/png" would sail past a
// check on the declared type and into libvips/librsvg. Trust the bytes instead.

export type FileKind = 'pdf' | 'png' | 'jpeg' | 'webp' | 'text';

export const IMAGE_MIME = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
} as const;

export function isImageKind(kind: FileKind | null): kind is keyof typeof IMAGE_MIME {
  return kind === 'png' || kind === 'jpeg' || kind === 'webp';
}

export function sniffFileKind(b: Uint8Array): FileKind | null {
  const startsWith = (...sig: number[]) => sig.every((v, i) => b[i] === v);

  if (startsWith(0x25, 0x50, 0x44, 0x46)) return 'pdf'; // %PDF
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) return 'png'; // \x89PNG
  if (startsWith(0xff, 0xd8, 0xff)) return 'jpeg';
  // WebP = "RIFF" <4-byte size> "WEBP"  (a WAV or AVI also starts with RIFF)
  if (startsWith(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return 'webp';
  }

  // Plain text: non-empty and no NUL bytes in the first chunk. NOTE this also
  // matches an SVG (it is XML text) — callers that want only raster images must
  // reject 'text', which is exactly what isImageKind() does.
  const head = b.subarray(0, 1024);
  if (head.length > 0 && !head.includes(0)) return 'text';
  return null;
}
