import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow importing from the @viraedit/timeline package (Phase 4.4+)
  transpilePackages: [],

  // Strict mode for better error detection in development
  reactStrictMode: true,

  async redirects() {
    return [
      { source: '/favicon.ico', destination: '/favicon.svg', permanent: false },
    ]
  },

  // Image optimization — allow localhost for dev
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: '127.0.0.1' },
    ],
  },
}

export default nextConfig
