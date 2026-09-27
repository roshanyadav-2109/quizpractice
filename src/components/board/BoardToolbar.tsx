'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowUUpLeft,
  ArrowUUpRight,
  ArrowUpRight,
  Broom,
  CaretDown,
  Circle,
  DotsNine,
  Eraser,
  GridFour,
  HandPointing,
  Highlighter,
  LineSegment,
  PencilSimple,
  Square,
  Target,
} from '@/components/ui/icons'
import { ChipButton } from '@/components/ui/primitives'
import {
  activePage,
  canRedo,
  canUndo,
  pageIsEmpty,
  styleFamily,
  type BoardCommand,
  type BoardState,
} from '@/lib/board/model'
import {
  COLOR_NAMES,
  HIGHLIGHTER_COLORS,
  HIGHLIGHTER_COLOR_NAMES,
  PEN_COLORS,
  SHAPE_TOOLS,
  SIZE_NAMES,
  isShapeTool,
  type BoardBackground,
  type ShapeTool,
} from '@/lib/board/types'

const SHAPES: Record<ShapeTool, { label: string; icon: ReactNode }> = {
  line: { label: 'Line', icon: <LineSegment size={20} /> },
  arrow: { label: 'Arrow', icon: <ArrowUpRight size={20} /> },
  rect: { label: 'Rectangle', icon: <Square size={20} /> },
  ellipse: { label: 'Ellipse', icon: <Circle size={20} /> },
}

const BACKGROUND_OPTIONS: { bg: BoardBackground; label: string; icon: ReactNode }[] = [
  { bg: 'plain', label: 'Plain page', icon: <Square size={18} /> },
  { bg: 'grid', label: 'Squared page', icon: <GridFour size={18} /> },
  { bg: 'dots', label: 'Dotted page', icon: <DotsNine size={18} /> },
]

/**
 * The board's controls. Every keyboard shortcut has a button here too, since
 * a teacher on an iPad has no keyboard. Buttons are 40px: big enough for a
 * finger, and the Pencil never misses.
 */
export function BoardToolbar({
  state,
  dispatch,
  penSeen,
  fingerDraw,
  onFingerDrawChange,
}: {
  state: BoardState
  dispatch: (command: BoardCommand) => void
  /** A stylus has been used, so fingers have stopped drawing. */
  penSeen: boolean
  fingerDraw: boolean
  onFingerDrawChange: (value: boolean) => void
}) {
  const family = styleFamily(state.tool)
  const highlighter = family === 'highlighter'
  const colors = highlighter ? HIGHLIGHTER_COLORS : PEN_COLORS
  const colorNames = highlighter ? HIGHLIGHTER_COLOR_NAMES : COLOR_NAMES
  const colorIndex = highlighter ? state.highlighter.color : state.pen.color
  const sizeIndex =
    family === 'highlighter' ? state.highlighter.size : family === 'eraser' ? state.eraserSize : state.pen.size
  const page = activePage(state)

  return (
    <div
      role="toolbar"
      aria-label="Whiteboard tools"
      className="flex flex-wrap items-center gap-x-1 gap-y-1 rounded-control border border-rule bg-surface p-1"
    >
      <ToolButton label="Pen" shortcut="P" active={state.tool === 'pen'} onClick={() => dispatch({ type: 'setTool', tool: 'pen' })}>
        <PencilSimple size={20} />
      </ToolButton>
      <ToolButton
        label="Highlighter"
        shortcut="H"
        active={state.tool === 'highlighter'}
        onClick={() => dispatch({ type: 'setTool', tool: 'highlighter' })}
      >
        <Highlighter size={20} />
      </ToolButton>
      <ToolButton label="Eraser" shortcut="E" active={state.tool === 'eraser'} onClick={() => dispatch({ type: 'setTool', tool: 'eraser' })}>
        <Eraser size={20} />
      </ToolButton>
      <ToolButton label="Laser pointer" shortcut="L" active={state.tool === 'laser'} onClick={() => dispatch({ type: 'setTool', tool: 'laser' })}>
        <Target size={20} />
      </ToolButton>
      <ShapeMenu state={state} dispatch={dispatch} />

      <Divider />

      <div role="group" aria-label={highlighter ? 'Highlighter colour' : 'Ink colour'} className="flex items-center">
        {colors.map((color, index) => {
          const selected = family !== 'eraser' && state.tool !== 'laser' && index === colorIndex
          return (
            <button
              key={color}
              type="button"
              title={`${colorNames[index]} (${index + 1})`}
              aria-label={colorNames[index]}
              aria-pressed={selected}
              onClick={() => dispatch({ type: 'setColor', index })}
              className="flex h-10 w-8 items-center justify-center rounded-control hover:bg-surface-2"
            >
              <span
                className={`block h-6 w-6 rounded-full ${selected ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'ring-1 ring-black/15'}`}
                style={{ backgroundColor: color }}
              />
            </button>
          )
        })}
      </div>

      <Divider />

      <div role="group" aria-label={family === 'eraser' ? 'Eraser size' : 'Line width'} className="flex items-center">
        {SIZE_NAMES.map((name, index) => (
          <ToolButton
            key={name}
            label={`${name}${family === 'eraser' ? ' eraser' : ''}`}
            shortcut={index === 0 ? '[' : index === 2 ? ']' : undefined}
            active={family !== null && index === sizeIndex}
            disabled={family === null}
            onClick={() => dispatch({ type: 'setSize', index })}
          >
            <span
              aria-hidden
              className="block rounded-full bg-current"
              style={{ width: 4 + index * 4, height: 4 + index * 4 }}
            />
          </ToolButton>
        ))}
      </div>

      <Divider />

      <div role="group" aria-label="Page ruling" className="flex items-center">
        {BACKGROUND_OPTIONS.map((option) => (
          <ToolButton
            key={option.bg}
            label={option.label}
            active={page.bg === option.bg}
            onClick={() => dispatch({ type: 'setBg', bg: option.bg })}
          >
            {option.icon}
          </ToolButton>
        ))}
      </div>

      <Divider />

      <ActionButton label="Undo" shortcut="Ctrl+Z" disabled={!canUndo(state)} onClick={() => dispatch({ type: 'undo' })}>
        <ArrowUUpLeft size={20} />
      </ActionButton>
      <ActionButton label="Redo" shortcut="Ctrl+Shift+Z" disabled={!canRedo(state)} onClick={() => dispatch({ type: 'redo' })}>
        <ArrowUUpRight size={20} />
      </ActionButton>
      <ActionButton label="Clear page (undo brings it back)" disabled={pageIsEmpty(page)} onClick={() => dispatch({ type: 'clearPage' })}>
        <Broom size={20} />
      </ActionButton>

      {penSeen ? (
        <>
          <Divider />
          <ChipButton
            active={fingerDraw}
            onClick={() => onFingerDrawChange(!fingerDraw)}
            title="A stylus has been used, so fingers scroll instead of drawing. Turn this on to draw with a finger too."
            className="gap-1.5"
          >
            <HandPointing size={16} />
            Draw with finger
          </ChipButton>
        </>
      ) : null}
    </div>
  )
}

function Divider() {
  return <span aria-hidden className="mx-1 h-6 w-px bg-rule" />
}

const ICON_BUTTON =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control transition-colors disabled:pointer-events-none disabled:opacity-40'

function ToolButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  shortcut?: string
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`${ICON_BUTTON} ${active ? 'bg-ink text-white' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'}`}
    >
      {children}
    </button>
  )
}

function ActionButton({
  label,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string
  shortcut?: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`${ICON_BUTTON} text-ink-muted hover:bg-surface-2 hover:text-ink`}
    >
      {children}
    </button>
  )
}

/** The four shapes behind one button, which shows the shape last used. */
function ShapeMenu({ state, dispatch }: { state: BoardState; dispatch: (command: BoardCommand) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const active = isShapeTool(state.tool)
  const shape = SHAPES[state.shape]

  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !root.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div ref={root} className="relative flex">
      <button
        type="button"
        title={`${shape.label} (S)`}
        aria-label={`Shape: ${shape.label}`}
        aria-pressed={active}
        onClick={() => dispatch({ type: 'setTool', tool: state.shape })}
        className={`inline-flex h-10 w-10 items-center justify-center rounded-l-control transition-colors ${active ? 'bg-ink text-white' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'}`}
      >
        {shape.icon}
      </button>
      <button
        type="button"
        title="Choose a shape. Hold Shift for straight lines, squares and circles."
        aria-label="Choose a shape"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-10 w-5 items-center justify-center rounded-r-control transition-colors ${active ? 'bg-ink text-white' : 'text-ink-muted hover:bg-surface-2 hover:text-ink'}`}
      >
        <CaretDown size={12} />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Shapes"
          className="absolute top-full left-0 z-20 mt-1 flex min-w-40 flex-col rounded-control border border-rule bg-surface p-1"
        >
          {SHAPE_TOOLS.map((tool) => (
            <button
              key={tool}
              type="button"
              role="menuitemradio"
              aria-checked={state.tool === tool}
              onClick={() => {
                dispatch({ type: 'setTool', tool })
                setOpen(false)
              }}
              className={`flex h-10 items-center gap-2.5 rounded-control px-2.5 text-ui ${state.tool === tool ? 'bg-ink text-white' : 'text-ink hover:bg-surface-2'}`}
            >
              {SHAPES[tool].icon}
              {SHAPES[tool].label}
            </button>
          ))}
          <p className="px-2.5 pt-1 pb-1.5 text-micro text-ink-faint">Shift keeps it straight or square.</p>
        </div>
      ) : null}
    </div>
  )
}
