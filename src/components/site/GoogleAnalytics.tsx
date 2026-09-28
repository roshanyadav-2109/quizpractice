import Script from 'next/script'

/**
 * Google Analytics 4. Loaded after the page is interactive, so it never holds
 * up the first paint, and only on the production deployment — previews and
 * local development would count as visits otherwise.
 *
 * Page views as a student moves between pages are counted by GA4's enhanced
 * measurement ("page changes based on browser history events", on by
 * default), so nothing here tracks navigation by hand.
 *
 * GA sets cookies; the privacy policy says so (sections 1.2 and 6). Keep
 * Google signals and ad personalisation off in the GA property: the policy
 * promises no advertising use.
 */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || 'G-Q76DGZSFTS'

export function GoogleAnalytics() {
  if (process.env.VERCEL_ENV !== 'production') return null
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga4" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
      </Script>
    </>
  )
}
