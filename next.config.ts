// Hostname of the configured Supabase project, so Storage-hosted images are
// allowed without hard-coding a project id into the repo.
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname;
  } catch {
    return null;
  }
})();

const isDev = process.env.NODE_ENV !== 'production';

// Content-Security-Policy: limits where scripts, connections, frames and forms
// may come from/go to, so an injected script has far less it can do.
//
// 'unsafe-inline' is still needed for scripts and styles: Next.js emits inline
// bootstrap scripts, and Tailwind/next-font emit inline styles. Removing it
// would require per-request nonces (middleware) — a worthwhile follow-up. The
// directives that matter most here do NOT depend on it: frame-ancestors
// (clickjacking), object-src, base-uri and form-action.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`, // eval: dev HMR only
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:", // product images may be remote; blob: = upload preview
  "font-src 'self' data:",
  // The browser talks to Supabase (auth, cart). Groq is only called server-side.
  `connect-src 'self'${supabaseHost ? ` https://${supabaseHost} wss://${supabaseHost}` : ''}${
    isDev ? ' ws://localhost:* http://localhost:*' : ''
  }`,
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  // DISABLE_CSP=true (at build time) drops just the CSP — an escape hatch for
  // diagnosing whether the policy is responsible for a browser-side problem.
  ...(process.env.DISABLE_CSP === 'true' ? [] : [{ key: 'Content-Security-Policy', value: csp }]),
  // Don't let the browser guess content types (blocks MIME-sniffing attacks).
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Legacy equivalent of frame-ancestors for older browsers.
  { key: 'X-Frame-Options', value: 'DENY' },
  // Send only the origin (not full URLs with queries) to other sites.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Camera/geolocation/payment are unused. The microphone IS used (voice chat),
  // so it stays available to this origin only.
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), payment=(), microphone=(self)' },
  // Tell browsers to use HTTPS for this host (ignored over plain http).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the transformers library out of the bundler — it ships native
  // (onnxruntime) binaries that must be required at runtime, not bundled.
  serverExternalPackages: ['@xenova/transformers'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  images: {
    // Skip Next's image optimizer in favour of serving the files as-is.
    // The optimizer uses `sharp` (libvips/GLib), which is memory-hungry and
    // emits GLib-GObject warnings in slim Linux containers. Product images are
    // local and already small (20–130KB), so optimizing them isn't worth the
    // RAM on a 512MB host.
    unoptimized: true,
    remotePatterns: [
      ...(supabaseHost
        ? [
            {
              protocol: 'https',
              hostname: supabaseHost,
              port: '',
              pathname: '/storage/v1/object/public/**',
            },
          ]
        : []),
      {
        protocol: 'https',
        hostname: 'picsum.photos', // seed images used in supabase/schema.sql
        port: '',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;
