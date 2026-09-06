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
      {
        protocol: 'https',
        hostname: 'lhwuknhgjmthkmxblpph.supabase.co', // Hostname from your error
        port: '',
        pathname: '/storage/v1/object/public/productimages/**',
      },
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