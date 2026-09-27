import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MIME_PREFERENCE,
  baseVideoMime,
  formatLabel,
  isWebKitBrowser,
  mimeOrder,
  pickRecordingMime,
  recordingExtension,
} from './mime'

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const EDGE_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0'
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'
const IPAD =
  'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
const CHROME_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1'
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'

test('WebKit is Safari and every iPhone or iPad browser, nothing else', () => {
  assert.equal(isWebKitBrowser(SAFARI_MAC), true)
  assert.equal(isWebKitBrowser(IPAD), true)
  assert.equal(isWebKitBrowser(CHROME_IPHONE), true)
  assert.equal(isWebKitBrowser(CHROME_WIN), false)
  assert.equal(isWebKitBrowser(EDGE_WIN), false)
  assert.equal(isWebKitBrowser(FIREFOX), false)
  assert.equal(isWebKitBrowser(CHROME_ANDROID), false)
})

test('WebKit tries MP4 first, everything else WebM first, and nothing is lost', () => {
  assert.deepEqual(mimeOrder(false), [...MIME_PREFERENCE])
  const webkit = mimeOrder(true)
  assert.equal(webkit[0], 'video/mp4;codecs=avc1.42E01F,mp4a.40.2')
  assert.equal(webkit[1], 'video/mp4')
  assert.deepEqual([...webkit].sort(), [...MIME_PREFERENCE].sort())
})

test('the first supported type is picked', () => {
  const chrome = (mime: string) => mime.startsWith('video/webm')
  assert.equal(pickRecordingMime(chrome, false), 'video/webm;codecs=vp9,opus')

  const vp8Only = (mime: string) => mime === 'video/webm;codecs=vp8,opus' || mime === 'video/webm'
  assert.equal(pickRecordingMime(vp8Only, false), 'video/webm;codecs=vp8,opus')

  const safari = (mime: string) => mime.startsWith('video/mp4')
  assert.equal(pickRecordingMime(safari, true), 'video/mp4;codecs=avc1.42E01F,mp4a.40.2')

  // A newer Safari that can also do WebM still records MP4.
  assert.equal(pickRecordingMime(() => true, true), 'video/mp4;codecs=avc1.42E01F,mp4a.40.2')
})

test('a browser that throws or supports nothing gets null', () => {
  assert.equal(pickRecordingMime(() => false, false), null)
  assert.equal(
    pickRecordingMime(() => {
      throw new Error('unknown type')
    }, false),
    null,
  )
  // Throwing on one type does not stop the search.
  const picky = (mime: string) => {
    if (mime.includes('vp9')) throw new Error('no')
    return mime.includes('vp8')
  }
  assert.equal(pickRecordingMime(picky, false), 'video/webm;codecs=vp8,opus')
})

test('base types, extensions and labels', () => {
  assert.equal(baseVideoMime('video/webm;codecs=vp9,opus'), 'video/webm')
  assert.equal(baseVideoMime('VIDEO/MP4; codecs="avc1.42E01F"'), 'video/mp4')
  assert.equal(baseVideoMime('video/quicktime'), null)
  assert.equal(recordingExtension('video/mp4;codecs=avc1.42E01F,mp4a.40.2'), 'mp4')
  assert.equal(recordingExtension('video/webm;codecs=vp8,opus'), 'webm')
  assert.equal(recordingExtension(''), 'webm')
  assert.equal(formatLabel('video/webm;codecs=vp9,opus'), 'WebM (VP9)')
  assert.equal(formatLabel('video/webm;codecs=vp8,opus'), 'WebM (VP8)')
  assert.equal(formatLabel('video/mp4'), 'MP4 (H.264)')
})
