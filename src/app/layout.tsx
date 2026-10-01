import type { Metadata, Viewport } from 'next'
import { Lexend, JetBrains_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteChrome } from '@/components/site/SiteChrome'
import { SiteFooter } from '@/components/site/SiteFooter'
import { AuthProvider } from '@/components/site/AuthDialog'
import { OfflineBanner } from '@/components/site/OfflineBanner'
import { RouteProgress } from '@/components/site/RouteProgress'
import { GoogleAnalytics } from '@/components/site/GoogleAnalytics'
import { ViewerProvider } from '@/components/site/Viewer'
import { DeviceBeacon } from '@/components/site/DeviceBeacon'
import { JsonLd } from '@/components/seo/JsonLd'
import { ORIGIN, SITE } from '@/lib/seo/site'
import { siteGraph } from '@/lib/seo/jsonld'

/**
 * Everything that is words or numbers: regular for text, medium for headings,
 * light for large display lines and quiet secondary copy. Nothing heavier is
 * ever used, so nothing heavier is loaded.
 */
const lexend = Lexend({
  variable: '--font-lexend',
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  display: 'swap',
})

/**
 * Code blocks, and nothing else — so it is not preloaded: most pages have no
 * code, and a preloaded font is one more download standing between every
 * visitor and the first paint. A page with code fetches it when it draws.
 */
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains',
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  metadataBase: new URL(ORIGIN),
  title: {
    default: `IITM BS PYQ — Previous Year Question Papers with Answers | ${SITE.name}`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.publisher, url: SITE.publisherUrl }],
  creator: SITE.publisher,
  publisher: SITE.publisher,
  category: 'education',
  // No canonical here: it would be inherited by every page that forgot its
  // own and point them all at the home page. Each page sets its own.
  openGraph: {
    type: 'website',
    siteName: SITE.name,
    locale: SITE.locale,
    title: 'IITM BS PYQ — Previous Year Question Papers with Answers',
    description: SITE.description,
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  formatDetection: { telephone: false, email: false, address: false },
  // Search Console and Bing Webmaster Tools ownership, when the tokens are set.
  verification: {
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { other: { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } }
      : {}),
  },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <head>
        {/* For AI agents: the site described in plain text (llmstxt.org). */}
        <link rel="describedby" type="text/plain" href="/llms.txt" />
      </head>
      <body
        className={`${lexend.variable} ${jetbrainsMono.variable} flex min-h-screen flex-col antialiased`}
      >
        {/* Who runs the site, on every page: the identity search engines and
            AI assistants join the rest of the structured data to. */}
        <JsonLd data={siteGraph()} />
        {/* A bar across the top while the next page is on its way. */}
        <RouteProgress />
        {/* Sign-in is a dialog, available from anywhere on the site. */}
        <AuthProvider>
          {/* Who is signed in, known in the browser: the pages themselves are
              the same for everyone and served from the CDN. */}
          <ViewerProvider>
            {/* The exam runner and the teacher's studio own the whole viewport;
                SiteChrome hides the navigation and the footer on them. */}
            <SiteChrome>
              <SiteHeader />
            </SiteChrome>

            <DeviceBeacon />
            <main className="flex-1">{children}</main>

            <SiteChrome part="footer">
              <SiteFooter />
            </SiteChrome>
          </ViewerProvider>
        </AuthProvider>
        <OfflineBanner />
        {/* Vercel Web Analytics: page views, without cookies. Sends nothing in development. */}
        <Analytics />
        {/* Google Analytics 4, on production only. */}
        <GoogleAnalytics />
      </body>
    </html>
  )
}
