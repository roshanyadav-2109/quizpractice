'use client'

import { useEffect } from 'react'
import { useViewer } from '@/components/site/Viewer'

/**
 * Tells the server which browser a signed-in account is using, once per browser
 * session, so accounts that copy the question bank from one machine can be linked
 * (public.register_device). Nothing is shown and nothing is stored but two ids:
 *
 *   d:  a random id kept in this browser, so the same browser is recognised
 *   f:  a hash of traits any browser has (screen, time zone, graphics, language),
 *       too coarse to name a person: used only to link accounts, never to block
 *
 * Signed-out visitors send nothing.
 */
async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function canvasTrait(): string {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 120
    canvas.height = 30
    const context = canvas.getContext('2d')
    if (!context) return ''
    context.textBaseline = 'top'
    context.font = '14px Arial'
    context.fillStyle = '#f60'
    context.fillRect(10, 5, 60, 20)
    context.fillStyle = '#069'
    context.fillText('Quiz Space 1.0', 4, 8)
    return canvas.toDataURL().slice(-64)
  } catch {
    return ''
  }
}

function graphicsTrait(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl')
    const info = gl?.getExtension('WEBGL_debug_renderer_info')
    return gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''
  } catch {
    return ''
  }
}

function deviceId(): string {
  try {
    const held = localStorage.getItem('qs_did')
    if (held) return held
    const made = crypto.randomUUID()
    localStorage.setItem('qs_did', made)
    document.cookie = `qs_did=${made}; max-age=31536000; path=/; samesite=lax`
    return made
  } catch {
    return ''
  }
}

export function DeviceBeacon() {
  const viewer = useViewer()
  const signedIn = viewer.status === 'signed-in'

  useEffect(() => {
    if (!signedIn) return
    try {
      if (sessionStorage.getItem('qs_beacon')) return
      sessionStorage.setItem('qs_beacon', '1')
    } catch {
      /* private mode: send anyway, once per page load */
    }
    ;(async () => {
      const traits = [
        navigator.userAgent,
        navigator.languages?.join(','),
        navigator.platform,
        navigator.hardwareConcurrency,
        screen.width,
        screen.height,
        screen.colorDepth,
        window.devicePixelRatio,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        canvasTrait(),
        graphicsTrait(),
      ].join('|')
      const [f, d] = [await sha256(traits), deviceId()]
      await fetch('/api/device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ f, d }),
        keepalive: true,
      }).catch(() => undefined)
    })()
  }, [signedIn])

  return null
}
