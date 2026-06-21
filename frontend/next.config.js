/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow images from external sources (hotel photos, etc.)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Expose backend URL to client-side code
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
};

module.exports = nextConfig;
