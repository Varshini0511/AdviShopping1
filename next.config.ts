/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lhwuknhgjmthkmxblpph.supabase.co', // Hostname from your error
        port: '',
        pathname: '/storage/v1/object/public/productimages/**',
      },
    ],
  },
};

module.exports = nextConfig;