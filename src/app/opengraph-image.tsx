// src/app/opengraph-image.tsx
//
// The share card shown when the link is posted on LinkedIn / Slack / X.
// Next.js turns this file convention into <meta property="og:image"> for every
// route automatically, and renders it once at build time.

import { ImageResponse } from 'next/og';

export const alt = 'AdviShopping — hybrid search, shopping agent, visual search';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const PILLS = [
  { title: 'Hybrid search', body: 'Keyword + semantic, fused with RRF, reranked by a cross-encoder' },
  { title: 'Shopping agent', body: 'Tool calling with a code-level grounding guardrail' },
  { title: 'Visual search', body: 'Upload a photo — CLIP finds similar products' },
];

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          color: '#e5e7eb',
          backgroundColor: '#070b14',
          backgroundImage:
            'radial-gradient(circle at 15% 0%, rgba(79,70,229,0.45), transparent 55%), radial-gradient(circle at 90% 0%, rgba(139,92,246,0.35), transparent 50%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: 16,
              backgroundColor: '#4f46e5',
              color: '#ffffff',
              fontSize: 40,
              fontWeight: 800,
            }}
          >
            A
          </div>
          <div style={{ display: 'flex', marginLeft: 20, fontSize: 40, fontWeight: 800, color: '#ffffff' }}>
            Advi<span style={{ color: '#818cf8' }}>Shopping</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 68, fontWeight: 800, lineHeight: 1.1, color: '#ffffff' }}>
            Search that understands what you mean.
          </div>
          <div style={{ display: 'flex', marginTop: 20, fontSize: 30, color: '#a5b4fc' }}>
            6-stage retrieval pipeline · tool-calling agent · measured with an eval harness
          </div>
        </div>

        <div style={{ display: 'flex' }}>
          {PILLS.map((p, i) => (
            <div
              key={p.title}
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                padding: '20px 24px',
                marginLeft: i === 0 ? 0 : 20,
                borderRadius: 20,
                border: '1px solid rgba(255,255,255,0.14)',
                backgroundColor: 'rgba(15,23,42,0.75)',
              }}
            >
              <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: '#ffffff' }}>{p.title}</div>
              <div style={{ display: 'flex', marginTop: 8, fontSize: 20, lineHeight: 1.35, color: '#94a3b8' }}>
                {p.body}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    size
  );
}
