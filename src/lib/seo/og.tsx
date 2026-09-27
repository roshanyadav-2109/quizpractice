import { ImageResponse } from 'next/og'
import { ORIGIN, SITE } from './site'

/**
 * The card a shared link unfolds into — in WhatsApp and Telegram groups,
 * on X and LinkedIn, and in an assistant's link preview. One layout for
 * every page: the brand, what the page is in a few large words, the
 * numbers, and the address.
 */

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_TYPE = 'image/png'

const INK = '#0c0a09'
const MUTED = '#57534e'
const FAINT = '#a8a29e'
const ACCENT = '#1d4ed8'
const GROUND = '#f7f8fa'

export function ogCard({
  eyebrow,
  title,
  subtitle,
  chips = [],
}: {
  eyebrow: string
  title: string
  subtitle?: string
  chips?: string[]
}): ImageResponse {
  const size = title.length > 42 ? 64 : title.length > 28 ? 76 : 88
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: GROUND,
          padding: '64px 72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 40, color: INK, fontWeight: 700, letterSpacing: -0.5 }}>{SITE.shortName}</div>
          <div style={{ fontSize: 22, color: MUTED }}>{`A product by ${SITE.publisher}`}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 28, color: ACCENT, marginBottom: 14 }}>{eyebrow}</div>
          <div style={{ fontSize: size, lineHeight: 1.08, color: INK, fontWeight: 600, letterSpacing: -1.5 }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 32, color: MUTED, marginTop: 20 }}>{subtitle}</div> : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            {chips.slice(0, 4).map((chip) => (
              <div
                key={chip}
                style={{
                  display: 'flex',
                  fontSize: 24,
                  color: INK,
                  background: '#ffffff',
                  border: '2px solid #e7e5e4',
                  borderRadius: 999,
                  padding: '8px 20px',
                }}
              >
                {chip}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 24, color: FAINT }}>{new URL(ORIGIN).host}</div>
        </div>
      </div>
    ),
    OG_SIZE,
  )
}
