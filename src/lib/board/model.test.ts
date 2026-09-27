import test from 'node:test'
import assert from 'node:assert/strict'
import {
  activePage,
  boardReducer,
  canRedo,
  canUndo,
  constrainShape,
  initialBoardState,
  placeNewFigure,
  sanitizePages,
  simulatedPressure,
  strokeHit,
  strokeStyle,
  type BoardCommand,
  type BoardState,
} from './model'
import { BOARD_W, MAX_FIGURES, type PinnedFigure, type Stroke } from './types'

let seq = 0
function pen(points: [number, number][], size = 4): Stroke {
  seq += 1
  return { id: `s${seq}`, tool: 'pen', color: '#111111', size, pts: points.flatMap(([x, y]) => [x, y, 0.5]) }
}

function shape(tool: Stroke['tool'], pts: number[], size = 4): Stroke {
  seq += 1
  return { id: `s${seq}`, tool, color: '#1d4ed8', size, pts }
}

function figure(id = 'f1'): PinnedFigure {
  return { id, image: { public_id: 'qp/test/fig' }, x: 10, y: 10, w: 200, h: 100 }
}

function run(state: BoardState, ...commands: BoardCommand[]): BoardState {
  return commands.reduce(boardReducer, state)
}

const ids = (state: BoardState) => activePage(state).strokes.map((stroke) => stroke.id)

test('a stroke is added, undone and redone', () => {
  const a = pen([
    [0, 0],
    [10, 10],
  ])
  let state = run(initialBoardState(), { type: 'addStroke', stroke: a })
  assert.deepEqual(ids(state), [a.id])
  assert.ok(canUndo(state))

  state = run(state, { type: 'undo' })
  assert.deepEqual(ids(state), [])
  assert.ok(canRedo(state))

  state = run(state, { type: 'redo' })
  assert.deepEqual(ids(state), [a.id])
  assert.ok(!canRedo(state))
})

test('a new change clears the redo stack', () => {
  const a = pen([[0, 0]])
  const b = pen([[5, 5]])
  const state = run(initialBoardState(), { type: 'addStroke', stroke: a }, { type: 'undo' }, { type: 'addStroke', stroke: b })
  assert.ok(!canRedo(state))
  assert.deepEqual(ids(state), [b.id])
})

test('a command that changes nothing returns the same state', () => {
  const state = initialBoardState()
  assert.equal(boardReducer(state, { type: 'undo' }), state)
  assert.equal(boardReducer(state, { type: 'redo' }), state)
  assert.equal(boardReducer(state, { type: 'clearPage' }), state)
  assert.equal(boardReducer(state, { type: 'eraseAt', x: 50, y: 50, r: 10, gesture: 'g' }), state)
  assert.equal(boardReducer(state, { type: 'setTool', tool: 'pen' }), state)
  assert.equal(boardReducer(state, { type: 'goto', index: 0 }), state)
  assert.equal(boardReducer(state, { type: 'deletePage' }), state, 'the last page cannot be deleted')
})

test('the eraser removes whole strokes it touches, and nothing else', () => {
  const near = pen([
    [0, 100],
    [200, 100],
  ])
  const far = pen([
    [0, 400],
    [200, 400],
  ])
  const state = run(
    initialBoardState(),
    { type: 'addStroke', stroke: near },
    { type: 'addStroke', stroke: far },
    { type: 'eraseAt', x: 100, y: 108, r: 8, gesture: 'g1' },
  )
  assert.deepEqual(ids(state), [far.id])
})

test('one erasing drag is one undo step, and strokes come back in order', () => {
  const a = pen([
    [0, 100],
    [100, 100],
  ])
  const b = pen([
    [0, 200],
    [100, 200],
  ])
  const c = pen([
    [0, 300],
    [100, 300],
  ])
  let state = run(
    initialBoardState(),
    { type: 'addStroke', stroke: a },
    { type: 'addStroke', stroke: b },
    { type: 'addStroke', stroke: c },
    { type: 'eraseAt', x: 50, y: 300, r: 5, gesture: 'drag' },
    { type: 'eraseAt', x: 50, y: 100, r: 5, gesture: 'drag' },
  )
  assert.deepEqual(ids(state), [b.id])

  state = run(state, { type: 'undo' })
  assert.deepEqual(ids(state), [a.id, b.id, c.id])

  state = run(state, { type: 'redo' })
  assert.deepEqual(ids(state), [b.id])

  // A separate drag is a separate step.
  state = run(state, { type: 'eraseAt', x: 50, y: 200, r: 5, gesture: 'another' }, { type: 'undo' })
  assert.deepEqual(ids(state), [b.id])
})

test('shapes are erased by their outline, not their inside', () => {
  const box = shape('rect', [100, 100, 300, 300])
  assert.ok(!strokeHit(box, 200, 200, 10), 'the middle of a rectangle is empty')
  assert.ok(strokeHit(box, 200, 102, 5), 'its top edge is ink')
  const ring = shape('ellipse', [100, 100, 300, 300])
  assert.ok(!strokeHit(ring, 200, 200, 10))
  assert.ok(strokeHit(ring, 300, 200, 4))
  const arrow = shape('arrow', [0, 0, 200, 0])
  assert.ok(strokeHit(arrow, 100, 3, 2))
  assert.ok(!strokeHit(arrow, 100, 60, 5))
  const dot = pen([[40, 40]])
  assert.ok(strokeHit(dot, 44, 40, 3))
})

test('clearing a page is undoable, figures included', () => {
  const a = pen([[0, 0]])
  let state = run(
    initialBoardState(),
    { type: 'addStroke', stroke: a },
    { type: 'pinFigure', figure: figure() },
    { type: 'clearPage' },
  )
  assert.equal(activePage(state).strokes.length, 0)
  assert.equal(activePage(state).figures.length, 0)
  state = run(state, { type: 'undo' })
  assert.deepEqual(ids(state), [a.id])
  assert.equal(activePage(state).figures.length, 1)
})

test('each page keeps its own undo history', () => {
  const a = pen([[0, 0]])
  const b = pen([[9, 9]])
  let state = run(initialBoardState(), { type: 'addStroke', stroke: a }, { type: 'addPage' })
  assert.equal(state.current, 1)
  assert.ok(!canUndo(state), 'a new page has nothing to undo')

  state = run(state, { type: 'addStroke', stroke: b }, { type: 'undo' }, { type: 'undo' })
  assert.deepEqual(ids(state), [], 'undo on page 2 stops at page 2')

  state = run(state, { type: 'goto', index: 0 })
  assert.deepEqual(ids(state), [a.id], 'page 1 is untouched')
  state = run(state, { type: 'undo' })
  assert.deepEqual(ids(state), [])
})

test('pages are added after the current one and keep its ruling', () => {
  let state = run(initialBoardState(), { type: 'setBg', bg: 'grid' }, { type: 'addPage' })
  assert.equal(activePage(state).bg, 'grid')
  state = run(state, { type: 'goto', index: 0 }, { type: 'addPage' })
  assert.equal(state.current, 1)
  assert.equal(state.pages.length, 3)
})

test('deleting a page moves to a neighbour and forgets its history', () => {
  const a = pen([[0, 0]])
  let state = run(initialBoardState(), { type: 'addPage' }, { type: 'addStroke', stroke: a }, { type: 'addPage' })
  const deletedId = state.pages[1].id
  state = run(state, { type: 'deletePage', index: 1 })
  assert.equal(state.pages.length, 2)
  assert.equal(state.current, 1, 'still on the page that was current')
  assert.ok(!(deletedId in state.history))

  state = run(state, { type: 'deletePage' })
  assert.equal(state.pages.length, 1)
  assert.equal(state.current, 0)
})

test('goto is clamped to the pages there are', () => {
  const state = run(initialBoardState(), { type: 'addPage' }, { type: 'goto', index: 99 })
  assert.equal(state.current, 1)
  assert.equal(run(state, { type: 'goto', index: -4 }).current, 0)
})

test('the background is undoable', () => {
  let state = run(initialBoardState(), { type: 'setBg', bg: 'dots' })
  assert.equal(activePage(state).bg, 'dots')
  state = run(state, { type: 'undo' })
  assert.equal(activePage(state).bg, 'plain')
})

test('figures: at most four a page; moves are one undo step', () => {
  let state = initialBoardState()
  for (let i = 0; i < MAX_FIGURES + 2; i++) state = run(state, { type: 'pinFigure', figure: figure(`f${i}`) })
  assert.equal(activePage(state).figures.length, MAX_FIGURES)

  const from = { x: 10, y: 10, w: 200, h: 100 }
  state = run(
    state,
    { type: 'moveFigure', id: 'f0', rect: { ...from, x: 50 } },
    { type: 'moveFigure', id: 'f0', rect: { ...from, x: 90 } },
    { type: 'moveFigure', id: 'f0', rect: { ...from, x: 120 }, from },
  )
  assert.equal(activePage(state).figures[0].x, 120)
  state = run(state, { type: 'undo' })
  assert.equal(activePage(state).figures[0].x, 10)

  state = run(state, { type: 'unpinFigure', id: 'f1' })
  assert.deepEqual(
    activePage(state).figures.map((item) => item.id),
    ['f0', 'f2', 'f3'],
  )
  state = run(state, { type: 'undo' })
  assert.deepEqual(
    activePage(state).figures.map((item) => item.id),
    ['f0', 'f1', 'f2', 'f3'],
  )
})

test('a new figure fits the left half of the board, keeps its shape and goes below the last', () => {
  const page = initialBoardState().pages[0]
  const rect = placeNewFigure(page, 4)
  assert.ok(rect.w <= BOARD_W / 2)
  assert.ok(Math.abs(rect.w / rect.h - 4) < 0.01)
  const next = placeNewFigure({ ...page, figures: [{ ...figure(), ...rect }] }, 4)
  assert.ok(next.y >= rect.y + rect.h, 'stacked, not on top')
  // A figure moved away frees the top of the column.
  const moved = placeNewFigure({ ...page, figures: [{ ...figure(), x: 700, y: 300, w: 400, h: 100 }] }, 4)
  assert.equal(moved.y, 32)
  // No room below a tall figure: stepped instead.
  const tall = placeNewFigure({ ...page, figures: [{ ...figure(), x: 32, y: 32, w: 400, h: 600 }] }, 1)
  assert.ok(tall.x > 32 && tall.y > 32)
})

test('colours and sizes follow the tool in hand', () => {
  let state = run(initialBoardState(), { type: 'setColor', index: 2 }, { type: 'setSize', index: 2 })
  assert.deepEqual(strokeStyle(state, 'pen'), { color: '#dc2626', size: 9 })
  assert.deepEqual(strokeStyle(state, 'rect'), { color: '#dc2626', size: 9 }, 'shapes share the pen')

  state = run(state, { type: 'setTool', tool: 'highlighter' }, { type: 'setColor', index: 1 }, { type: 'stepSize', delta: -1 })
  assert.deepEqual(strokeStyle(state, 'highlighter'), { color: '#22c55e', size: 14 })
  assert.equal(strokeStyle(state, 'pen').color, '#dc2626', 'the pen keeps its own colour')

  // A colour picked with the eraser in hand means "draw".
  state = run(state, { type: 'setTool', tool: 'eraser' }, { type: 'setColor', index: 3 })
  assert.equal(state.tool, 'pen')
  assert.equal(run(state, { type: 'setColor', index: 17 }), state, 'out-of-range colours are ignored')
})

test('S cycles through the shapes', () => {
  let state = run(initialBoardState(), { type: 'cycleShape' })
  assert.equal(state.tool, 'line')
  state = run(state, { type: 'cycleShape' }, { type: 'cycleShape' })
  assert.equal(state.tool, 'rect')
  state = run(state, { type: 'setTool', tool: 'pen' }, { type: 'cycleShape' })
  assert.equal(state.tool, 'rect', 'returns to the shape last used')
})

test('Shift snaps lines to 45° and boxes to squares', () => {
  const [, , x2, y2] = constrainShape('line', 0, 0, 100, 10)
  assert.ok(Math.abs(y2) < 1e-9 && Math.abs(x2 - Math.hypot(100, 10)) < 1e-9)
  const [, , dx, dy] = constrainShape('line', 0, 0, 100, 90)
  assert.ok(Math.abs(dx - dy) < 1e-9)
  assert.deepEqual(constrainShape('rect', 10, 10, 60, -100), [10, 10, 120, -100])
})

test('simulated pressure thins fast strokes and does not depend on the event rate', () => {
  const slow = simulatedPressure(0.5, 1, 16.7, 5)
  const fast = simulatedPressure(0.5, 40, 16.7, 5)
  assert.ok(slow > fast)
  // The same speed at 60 Hz and at 1000 Hz ends in the same place.
  let at60 = 0.5
  for (let i = 0; i < 60; i++) at60 = simulatedPressure(at60, 10, 1000 / 60, 5)
  let at1000 = 0.5
  for (let i = 0; i < 1000; i++) at1000 = simulatedPressure(at1000, 10 / (1000 / 60), 1, 5)
  assert.ok(Math.abs(at60 - at1000) < 0.05, `${at60} vs ${at1000}`)
  assert.ok(fast >= 0.15 && slow <= 1)
})

test('stored pages are read back safely', () => {
  assert.equal(sanitizePages('nope'), null)
  assert.equal(sanitizePages([]), null)
  const pages = sanitizePages([
    {
      id: 'p1',
      bg: 'grid',
      strokes: [
        { id: 'a', tool: 'pen', color: '#112233', size: 4, pts: [1, 2, 0.5] },
        { id: 'b', tool: 'pen', color: 'red', size: 4, pts: [1, 2, 0.5] },
        { id: 'c', tool: 'rect', color: '#112233', size: 4, pts: [1, 2, 3] },
        { id: 'd', tool: 'laser', color: '#112233', size: 4, pts: [1, 2, 0.5] },
        { id: 'e', tool: 'line', color: '#AABBCC', size: 4, pts: [1, 2, 3, 4] },
      ],
      figures: [
        { id: 'f', image: { public_id: 'qp/x' }, x: 0, y: 0, w: 50, h: 50 },
        { id: 'g', image: { public_id: 'qp/y', source_url: 'https://example.com/a.png' }, x: 0, y: 0, w: 50, h: 50 },
      ],
    },
    { id: 'p1', bg: 'lined' },
    null,
  ])
  assert.ok(pages)
  assert.equal(pages.length, 2)
  assert.deepEqual(
    pages[0].strokes.map((stroke) => stroke.id),
    ['a', 'e'],
  )
  assert.equal(pages[0].strokes[1].color, '#aabbcc')
  assert.deepEqual(
    pages[0].figures.map((item) => item.id),
    ['f'],
  )
  assert.notEqual(pages[1].id, 'p1', 'a repeated page id is replaced')
  assert.equal(pages[1].bg, 'plain')
})

test('load replaces the pages and starts history afresh', () => {
  const a = pen([[0, 0]])
  const loaded = sanitizePages([{ id: 'x', bg: 'dots', strokes: [], figures: [] }])!
  const state = run(initialBoardState(), { type: 'addStroke', stroke: a }, { type: 'load', pages: loaded })
  assert.equal(state.pages.length, 1)
  assert.equal(activePage(state).bg, 'dots')
  assert.ok(!canUndo(state))
})
