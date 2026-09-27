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
    // Enables forbidden() and unauthorized() from next/navigation, so a page
    // can answer a signed-in user without access — a teacher opening a
    // subject they are not assigned — with a real 403 rather than a 404.
    authInterrupts: true,
  },
  // The printable worksheet is gone. Old links and bookmarks land on the
  // paper's instructions page instead of a 404. Temporary, so nothing caches
  // it for good in case a download ever comes back.
  async redirects() {
    return [{ source: '/print/:setId', destination: '/paper/:setId', permanent: false }]
  },
}

export default nextConfig
