import type { NextConfig } from 'next'

const config: NextConfig = {
  // Images from Goodreads CDN (cover thumbnails)
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.gr-assets.com' },
      { protocol: 'https', hostname: '**.goodreads.com' },
    ],
  },
}

export default config
