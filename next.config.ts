import type { NextConfig } from 'next'

/**
 * Only the production deployment may be indexed. Previews and the bare
 * *.vercel.app address serve the same pages; left open they compete with
 * the real site for its own content.
 */
const indexable = process.env.VERCEL_ENV === undefined || process.env.VERCEL_ENV === 'production'

/**
 * The one address the site answers on. In production any other host — the
 * project's *.vercel.app aliases — is sent here permanently, so links and
 * crawlers consolidate on a single domain. API routes are left alone: the
 * cron and OAuth callbacks must not be bounced.
 */
const canonical = (() => {
  try {
    return process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : null
  } catch {
    return null
  }
})()
const hostRedirects =
  process.env.VERCEL_ENV === 'production' && canonical && !canonical.hostname.endsWith('localhost')
    ? [
        {
          source: '/:path((?!api/).*)',
          // The server's own address is left alone: the image optimiser fetches /art/... from it, and a
          // redirect there made every icon fail (self-hosted, where the app listens on 127.0.0.1:3100; a host is matched without its port).
          missing: [
            { type: 'host' as const, value: canonical.host },
            { type: 'host' as const, value: '127.0.0.1' },
            { type: 'host' as const, value: 'localhost' },
          ],
          destination: `${canonical.origin}/:path`,
          permanent: true,
        },
      ]
    : []

const nextConfig: NextConfig = {
  // Development only: other devices on the network (a phone, to check the site
  // on it) may load the dev server's scripts. DEV_ORIGINS in .env.local, comma separated.
  allowedDevOrigins: process.env.DEV_ORIGINS ? process.env.DEV_ORIGINS.split(',').map((origin) => origin.trim()) : [],
  // Titles, descriptions and canonicals go in the <head> of the first byte
  // for every client. By default Next streams them after the body for
  // crawlers it believes run JavaScript, and AI crawlers mostly do not.
  htmlLimitedBots: /.*/,
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
  async headers() {
    return indexable
      ? []
      : [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }]
  },
  async redirects() {
    return [
      ...hostRedirects,
      // The printable worksheet is gone. Old links and bookmarks land on the
      // paper's page instead of a 404. Temporary, so nothing caches it for
      // good in case a download ever comes back.
      { source: '/print/:setId', destination: '/paper/:setId', permanent: false },
    ]
  },
}

export default nextConfig
