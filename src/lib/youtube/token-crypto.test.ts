import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { TokenCryptoError, openToken, sealToken } from './token-crypto'

const KEY = randomBytes(32)
const TOKEN = '1//0gExampleRefreshToken-with_all.the/characters+Google=uses'

/** The sealed value with one character of the given part swapped for another. */
function tamper(sealed: string, part: 1 | 2 | 3): string {
  const parts = sealed.split('.')
  const text = parts[part]
  const i = Math.floor(text.length / 2)
  parts[part] = text.slice(0, i) + (text[i] === 'A' ? 'B' : 'A') + text.slice(i + 1)
  return parts.join('.')
}

test('a sealed token opens to the same token', () => {
  const sealed = sealToken(TOKEN, KEY)
  assert.equal(openToken(sealed, KEY), TOKEN)
})

test('the sealed form is v1 and four base64url parts, with no plaintext in it', () => {
  const sealed = sealToken(TOKEN, KEY)
  const parts = sealed.split('.')
  assert.equal(parts.length, 4)
  assert.equal(parts[0], 'v1')
  for (const part of parts.slice(1)) assert.match(part, /^[A-Za-z0-9_-]+$/)
  assert.ok(!sealed.includes('RefreshToken'))
})

test('sealing twice gives two different values (fresh IV each time)', () => {
  const a = sealToken(TOKEN, KEY)
  const b = sealToken(TOKEN, KEY)
  assert.notEqual(a, b)
  assert.equal(openToken(a, KEY), TOKEN)
  assert.equal(openToken(b, KEY), TOKEN)
})

test('a change to the iv, the tag or the ciphertext is detected', () => {
  const sealed = sealToken(TOKEN, KEY)
  for (const part of [1, 2, 3] as const) {
    assert.throws(() => openToken(tamper(sealed, part), KEY), TokenCryptoError, `part ${part}`)
  }
})

test('another key cannot open it', () => {
  const sealed = sealToken(TOKEN, KEY)
  assert.throws(() => openToken(sealed, randomBytes(32)), TokenCryptoError)
})

test('malformed values are refused, not guessed at', () => {
  const sealed = sealToken(TOKEN, KEY)
  const bad = [
    '',
    'plaintext-token',
    sealed.replace(/^v1\./, 'v2.'),
    sealed.split('.').slice(0, 3).join('.'),
    `${sealed}.extra`,
    'v1.AAAA.BBBB.CCCC',
  ]
  for (const value of bad) {
    assert.throws(() => openToken(value, KEY), TokenCryptoError, JSON.stringify(value))
  }
})

test('the error never carries the token or the key', () => {
  const sealed = sealToken(TOKEN, KEY)
  try {
    openToken(tamper(sealed, 3), KEY)
    assert.fail('should have thrown')
  } catch (error) {
    const message = String((error as Error).message)
    assert.ok(!message.includes(TOKEN))
    assert.ok(!message.includes(KEY.toString('base64')))
  }
})

test('a key of the wrong length is refused', () => {
  assert.throws(() => sealToken(TOKEN, randomBytes(16)), TokenCryptoError)
  assert.throws(() => openToken(sealToken(TOKEN, KEY), randomBytes(31)), TokenCryptoError)
})

test('an empty token is not sealed', () => {
  assert.throws(() => sealToken('', KEY), TokenCryptoError)
})
