import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalYouTubeUrl, parseYouTubeUrl, youTubeEmbedUrl } from './url'

const ID = 'dQw4w9WgXcQ'

test('every accepted link form gives the video id', () => {
  const forms = [
    `https://youtu.be/${ID}`,
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&list=PL123&index=2`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://youtube.com/shorts/${ID}?feature=share`,
    `https://www.youtube.com/live/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://youtube-nocookie.com/embed/${ID}`,
    `http://youtu.be/${ID}`,
    `youtu.be/${ID}`,
    `www.youtube.com/watch?v=${ID}`,
    `  https://youtu.be/${ID}  `,
    `https://YOUTU.BE/${ID}`,
  ]
  for (const form of forms) {
    assert.deepEqual(parseYouTubeUrl(form), { id: ID, start: null }, form)
  }
})

test('start times read as seconds in every spelling', () => {
  assert.equal(parseYouTubeUrl(`https://youtu.be/${ID}?t=90`)?.start, 90)
  assert.equal(parseYouTubeUrl(`https://youtu.be/${ID}?t=90s`)?.start, 90)
  assert.equal(parseYouTubeUrl(`https://youtu.be/${ID}?t=1m30s`)?.start, 90)
  assert.equal(parseYouTubeUrl(`https://youtu.be/${ID}?t=1h2m3s`)?.start, 3723)
  assert.equal(parseYouTubeUrl(`https://youtu.be/${ID}?t=2m`)?.start, 120)
  assert.equal(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&t=45`)?.start, 45)
  assert.equal(parseYouTubeUrl(`https://www.youtube.com/embed/${ID}?start=75`)?.start, 75)
  assert.equal(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}#t=1m5s`)?.start, 65)
})

test('a zero or unreadable start time plays from the beginning', () => {
  assert.equal(parseYouTubeUrl(`https://youtu.be/${ID}?t=0`)?.start, null)
  assert.equal(parseYouTubeUrl(`https://youtu.be/${ID}?t=abc`)?.start, null)
  assert.equal(parseYouTubeUrl(`https://youtu.be/${ID}?t=`)?.start, null)
  assert.equal(parseYouTubeUrl(`https://youtu.be/${ID}?t=-5`)?.start, null)
})

test('bad ids are refused', () => {
  assert.equal(parseYouTubeUrl('https://youtu.be/short'), null)
  assert.equal(parseYouTubeUrl('https://youtu.be/dQw4w9WgXcQQ'), null, 'twelve characters')
  assert.equal(parseYouTubeUrl('https://youtu.be/dQw4w9WgX!Q'), null, 'illegal character')
  assert.equal(parseYouTubeUrl('https://www.youtube.com/watch?v='), null)
  assert.equal(parseYouTubeUrl('https://www.youtube.com/watch'), null)
  assert.equal(parseYouTubeUrl('https://youtu.be/'), null)
  assert.equal(parseYouTubeUrl(''), null)
})

test('other hosts and odd paths are refused', () => {
  assert.equal(parseYouTubeUrl(`https://vimeo.com/${ID}`), null)
  assert.equal(parseYouTubeUrl(`https://youtube.com.evil.example/watch?v=${ID}`), null)
  assert.equal(parseYouTubeUrl(`https://notyoutube.com/watch?v=${ID}`), null)
  assert.equal(parseYouTubeUrl(`https://evil.example/?u=https://youtu.be/${ID}`), null)
  assert.equal(parseYouTubeUrl(`https://www.youtube.com/channel/${ID}`), null)
  assert.equal(parseYouTubeUrl(`https://www.youtube-nocookie.com/watch?v=${ID}`), null)
  assert.equal(parseYouTubeUrl(`javascript:alert(1)//youtu.be/${ID}`), null)
  assert.equal(parseYouTubeUrl(`ftp://youtu.be/${ID}`), null)
  assert.equal(parseYouTubeUrl(`https://user:pass@youtu.be/${ID}`), null)
  assert.equal(parseYouTubeUrl(`https://youtu.be:8443/${ID}`), null)
  assert.equal(parseYouTubeUrl(`https://youtu.be/${ID} extra`), null)
})

test('canonical and embed forms carry the start time', () => {
  assert.equal(canonicalYouTubeUrl({ id: ID, start: null }), `https://youtu.be/${ID}`)
  assert.equal(canonicalYouTubeUrl({ id: ID, start: 90 }), `https://youtu.be/${ID}?t=90`)
  assert.equal(youTubeEmbedUrl({ id: ID, start: null }), `https://www.youtube-nocookie.com/embed/${ID}`)
  assert.equal(youTubeEmbedUrl({ id: ID, start: 90 }), `https://www.youtube-nocookie.com/embed/${ID}?start=90`)
})

test('the canonical form parses back to itself and passes the database check', () => {
  const dbCheck = /^https:\/\/(youtu\.be\/|(www\.|m\.)?youtube(-nocookie)?\.com\/)\S*$/
  for (const link of [`https://youtu.be/${ID}?t=1m30s`, `https://www.youtube.com/shorts/${ID}`]) {
    const ref = parseYouTubeUrl(link)
    assert.ok(ref)
    const canonical = canonicalYouTubeUrl(ref)
    assert.deepEqual(parseYouTubeUrl(canonical), ref)
    assert.match(canonical, dbCheck)
  }
})
