/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the transformers library out of the bundler — it ships native
  // (onnxruntime) binaries that must be required at runtime, not bundled.
  serverExternalPackages: ['@xenova/transformers'],
  images: {
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