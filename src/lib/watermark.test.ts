import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Block } from './blocks/schema'
import { encodeMark, markAt, markBlocks, markOf, readMarks } from './watermark'

const USER = '4f1c2d9e-7a3b-4c5d-9e8f-0a1b2c3d4e5f'

test('an account always gets the same mark, and different accounts different ones', () => {
  assert.equal(markOf(USER), markOf(USER))
  assert.match(markOf(USER), /^[0-9a-f]{8}$/)
  assert.notEqual(markOf(USER), markOf('another-user'))
})

test('a mark written into text reads back, and cannot be seen', () => {
  const mark = markOf(USER)
  const text = `Consider the relation ${encodeMark(mark)}R with attributes A and B.`
  assert.deepEqual(readMarks(text), [mark])
  assert.equal(text.replace(/[​‌⁠]/g, ''), 'Consider the relation R with attributes A and B.')
  assert.deepEqual(readMarks('Plain text with no mark.'), [])
})

test('the mark goes between two words of prose, never into maths, code, tables or lists', () => {
  assert.equal(markAt('Find the value'), 5)
  assert.equal(markAt('$a b$ is the sum'), 9)
  assert.equal(markAt('`x y` then more words'), 11)
  assert.equal(markAt('| a | b |\n|---|---|\n| 1 | 2 |'), -1)
  assert.equal(markAt('- one item\n- two items'), -1)
  assert.equal(markAt('# A heading'), -1)
  assert.equal(markAt('42'), -1)
})

test('only the first text block with room is marked, and the rest is untouched', () => {
  const mark = encodeMark(markOf(USER))
  const blocks: Block[] = [
    { type: 'math', latex: 'x^2' },
    { type: 'text', md: '$x$' },
    { type: 'text', md: 'Which of these is true?' },
    { type: 'text', md: 'Another paragraph here.' },
  ] as Block[]
  const marked = markBlocks(blocks, mark)
  assert.deepEqual(marked[0], blocks[0])
  assert.deepEqual(marked[1], blocks[1])
  assert.equal((marked[2] as { md: string }).md, `Which ${mark}of these is true?`)
  assert.deepEqual(marked[3], blocks[3])
  // It survives serialising too: the page's own data carries it.
  assert.deepEqual(readMarks(JSON.stringify(marked)), [markOf(USER)])
  assert.deepEqual(readMarks((marked[2] as { md: string }).md), [markOf(USER)])
})
