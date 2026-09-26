'use client'

/**
 * The last resort, for an error in the root layout itself. It replaces that
 * layout, so it brings its own <html> and <body> and keeps its styles inline.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#ffffff',
          color: '#0c0a09',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 440 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/art/states/server-error.webp" alt="" width={220} height={220} />
          <h1 style={{ fontSize: 22, fontWeight: 400, margin: '16px 0 8px' }}>Something went wrong</h1>
          <p style={{ color: '#57534e', fontWeight: 300, lineHeight: 1.5, margin: 0 }}>
            QuizPractice couldn’t load. Try again in a moment.
          </p>
          {error.digest ? <p style={{ color: '#78716c', fontSize: 12, fontFamily: 'monospace' }}>{error.digest}</p> : null}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 20,
              height: 42,
              padding: '0 18px',
              borderRadius: 10,
              border: 0,
              background: '#0c0a09',
              color: '#fff',
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
