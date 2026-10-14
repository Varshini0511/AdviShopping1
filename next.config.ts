// Hostname of the configured Supabase project, so Storage-hosted images are
// allowed without hard-coding a project id into the repo.
const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname;
  } catch {
    return null;
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the transformers library out of the bundler — it ships native
  // (onnxruntime) binaries that must be required at runtime, not bundled.
  serverExternalPackages: ['@xenova/transformers'],
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
