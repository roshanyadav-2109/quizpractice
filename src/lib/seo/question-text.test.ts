import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Block } from '@/lib/blocks/schema'
import { headlineTextOf, indexableText, slugTextOf, substanceOf, textBlocksOf } from './question-text'
import { questionSlug } from './paths'

const text = (md: string): Block => ({ type: 'text', md }) as Block

test('a comprehension question is titled by its sub-question, not the shared stem', () => {
  const body = [
    text('Listen to the audio and answer the given subquestions: 885_640653_0_1984128_hs1001qfq2e1s1q6mq.mp3'),
    text('What did Malala stand up for?'),
  ]
  assert.equal(slugTextOf(body), 'What did Malala stand up for?')
  assert.equal(questionSlug(10, slugTextOf(body)), 'q10-did-malala-stand-up')
})

test('a question that is all stem keeps its stem', () => {
  assert.equal(headlineTextOf(['Read the following passage and answer the given subquestions:']), 'Read the following passage and answer the given subquestions:')
})

test('file ids never reach a slug', () => {
  assert.equal(questionSlug(4, 'Listen to 885_640653_0_1984128_hs1001qfq2e1s1q6mq.mp3 carefully'), 'q4-listen-carefully')
})

test('indexable: enough words of its own; a stem and a figure is not', () => {
  const stemOnly = [text('Based on the above data, answer the given subquestions. The table shows sales for five years.')]
  assert.equal(indexableText(textBlocksOf(stemOnly), substanceOf(stemOnly)), false)
  const real = [text('Consider the relation Delivery_Fee(OrderID, Item, Fee). What is the output of the query below?')]
  assert.equal(indexableText(textBlocksOf(real), substanceOf(real)), true)
  const code = [{ type: 'code', language: 'python', source: 'total = 0\nfor i in range(10):\n    total += i * i\n    print(i * i, end=" ")\nprint(total)' } as Block]
  assert.equal(indexableText(textBlocksOf(code), substanceOf(code)), true)
})

test('text blocks are cut as the database cuts them', () => {
  const long = [text('x'.repeat(1000))]
  assert.equal(textBlocksOf(long)[0].length, 400)
})
