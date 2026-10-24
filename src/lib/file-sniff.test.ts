import { describe, expect, it } from 'vitest';
import { isImageKind, sniffFileKind } from './file-sniff';

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);

describe('sniffFileKind', () => {
  it('recognises PDF, PNG and JPEG by their signatures', () => {
    expect(sniffFileKind(text('%PDF-1.7\n...'))).toBe('pdf');
    expect(sniffFileKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png');
    expect(sniffFileKind(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10))).toBe('jpeg');
  });

  it('recognises WebP (RIFF....WEBP) but not other RIFF files such as WAV', () => {
    const webp = bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38);
    const wav = bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74);
    expect(sniffFileKind(webp)).toBe('webp');
    expect(sniffFileKind(wav)).not.toBe('webp');
  });

  it('treats NUL-free content as text and binary garbage as unknown', () => {
    expect(sniffFileKind(text('Invoice 42\nTotal 10.00'))).toBe('text');
    expect(sniffFileKind(bytes(0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00))).toBeNull(); // "MZ" executable header
    expect(sniffFileKind(new Uint8Array(0))).toBeNull();
  });

  it('ignores the filename/MIME entirely: a PDF is a PDF whatever it claims to be', () => {
    // (the function only ever sees bytes — there is no way for a label to leak in)
    expect(sniffFileKind(text('%PDF-1.4'))).toBe('pdf');
  });
});

describe('isImageKind (what the visual-search upload accepts)', () => {
  it('accepts only raster formats the app supports', () => {
    expect(isImageKind('png')).toBe(true);
    expect(isImageKind('jpeg')).toBe(true);
    expect(isImageKind('webp')).toBe(true);
  });

  it('rejects an SVG disguised as an image, because SVG is XML text', () => {
    const svg = text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(sniffFileKind(svg)).toBe('text');
    expect(isImageKind(sniffFileKind(svg))).toBe(false);
  });

  it('rejects HEIF (which carries NUL bytes), PDFs and unknown binaries', () => {
    const heif = bytes(0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63); // ....ftypheic
    expect(isImageKind(sniffFileKind(heif))).toBe(false);
    expect(isImageKind(sniffFileKind(text('%PDF-1.7')))).toBe(false);
    expect(isImageKind(null)).toBe(false);
  });
});
