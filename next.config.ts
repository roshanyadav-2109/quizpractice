import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Pin the workspace root. Without this Turbopack walks up and finds an
  // unrelated package-lock.json in the user's home directory.
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
  },
  experimental: {
    // Keep a visited page in the client cache for 30 s, so going back to it —
    // or clicking between a subject and its papers — is instant instead of
    // another server render. Since Next 15 the default is 0.
    staleTimes: {
      dynamic: 30,
    },
  },
}

export default nextConfig
