import type { Metadata } from 'next'
import { Lexend, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { SiteHeader } from '@/components/site/SiteHeader'
import { SiteChrome } from '@/components/site/SiteChrome'
import { AuthProvider } from '@/components/site/AuthDialog'
import { publicEnv } from '@/lib/env'

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

/** Code blocks, and nothing else. */
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains',
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: {
    default: 'Previous year papers — IIT Madras BS Degree',
    template: '%s — QuizPractice',
  },
  description:
    'Previous quiz, end term and OPPE question papers from the IIT Madras BS degree, taken under exam conditions.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${lexend.variable} ${jetbrainsMono.variable} flex min-h-screen flex-col antialiased`}
      >
        {/* Sign-in is a dialog, available from anywhere on the site. */}
        <AuthProvider>
          {/* The exam runner owns the whole viewport; SiteChrome hides the
              navigation on it. */}
          <SiteChrome>
            <SiteHeader />
          </SiteChrome>

          <main className="flex-1">{children}</main>
        </AuthProvider>
      </body>
    </html>
  )
}
