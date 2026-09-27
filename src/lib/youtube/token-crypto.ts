import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Seals the channel's refresh token before it is written to the database.
 *
 * The token is a standing permission to upload to the channel, so a leaked
 * database backup must not hand it over: it is stored AES-256-GCM encrypted
 * under YOUTUBE_TOKEN_KEY, which lives only in the server's environment. GCM
 * also authenticates, so a value edited in the table fails to open rather
 * than decrypting to something else.
 *
 * Sealed form: 'v1.<iv>.<tag>.<ciphertext>', each part base64url. The version
 * prefix leaves room to change the scheme without guessing at old rows.
 *
 * Pure node:crypto, no environment reads: the caller passes the key, so the
 * tests run without one.
 */

const VERSION = 'v1'
const IV_BYTES = 12
const TAG_BYTES = 16
/** Binds a sealed value to its purpose: it will not open as anything else sealed with the same key. */
const CONTEXT = Buffer.from('quizpractice:youtube_connection.refresh_token')

export class TokenCryptoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TokenCryptoError'
  }
}

function checkKey(key: Buffer): void {
  if (key.length !== 32) throw new TokenCryptoError('The token key must be 32 bytes.')
}

export function sealToken(plaintext: string, key: Buffer): string {
  checkKey(key)
  if (!plaintext) throw new TokenCryptoError('Nothing to seal.')

  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES })
  cipher.setAAD(CONTEXT)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.')
}

/** The token inside a sealed value. Throws TokenCryptoError when it was altered or sealed under another key. */
export function openToken(sealed: string, key: Buffer): string {
  checkKey(key)

  const parts = typeof sealed === 'string' ? sealed.split('.') : []
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new TokenCryptoError('The stored token is not in a form this version can read.')
  }

  const [, ivText, tagText, bodyText] = parts
  const iv = Buffer.from(ivText, 'base64url')
  const tag = Buffer.from(tagText, 'base64url')
  const ciphertext = Buffer.from(bodyText, 'base64url')
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ciphertext.length === 0) {
    throw new TokenCryptoError('The stored token is damaged.')
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES })
    decipher.setAAD(CONTEXT)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  } catch {
    // Never echo what failed: the message may end up in a log.
    throw new TokenCryptoError('The stored token could not be opened: it was changed, or YOUTUBE_TOKEN_KEY has changed.')
  }
}
