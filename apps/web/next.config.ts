import type { NextConfig } from 'next'
import path from 'path'

const remotionServiceRoot = path.join(__dirname, '../../remotion-service')

const nextConfig: NextConfig = {
  // Allow importing shared Remotion compositions from remotion-service/
  experimental: {
    externalDir: true,
  },

  transpilePackages: [],

  reactStrictMode: true,

  webpack: (config) => {
    const rootNodeModules = path.join(__dirname, '../../node_modules')
    config.resolve.alias = {
      ...config.resolve.alias,
      '@types': path.join(remotionServiceRoot, 'src/types'),
      '@lib': path.join(remotionServiceRoot, 'src/lib'),
      '@components': path.join(remotionServiceRoot, 'src/motion/components'),
      '@viraedit/remotion': path.join(remotionServiceRoot, 'src/motion'),
      // Force a single remotion instance so React context is shared
      remotion: path.join(rootNodeModules, 'remotion'),
    }
    return config
  },

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
