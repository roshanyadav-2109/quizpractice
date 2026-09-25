import type { Block } from '@/lib/blocks/schema'
import { TextBlockView } from './TextBlockView'
import { MathBlockView } from './MathBlockView'
import { TableBlockView } from './TableBlockView'
import { RelationBlockView } from './RelationBlockView'
import { CodeBlockView } from './CodeBlockView'
import { ErBlockView } from './ErBlockView'
import { GraphBlockView } from './GraphBlockView'
import { ChartBlockView } from './ChartBlockView'
import { ImageBlockView } from './ImageBlockView'

export type BlockContext = 'question' | 'option' | 'solution' | 'compact'

/**
 * Draws a question body. Every block type is rendered from its structured data,
 * so tables stay selectable, equations stay sharp at any zoom, code keeps its
 * highlighting and everything is correct in both themes. Only `image` blocks
 * are pictures, and those carry required alt text.
 */
export function BlockRenderer({
  blocks,
  context = 'question',
}: {
  blocks: Block[]
  context?: BlockContext
}) {
  if (!blocks.length) return null

  return (
    <div className={context === 'option' ? 'flex flex-col gap-1.5' : 'flex flex-col gap-3'}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} context={context} />
      ))}
    </div>
  )
}

function BlockView({ block, context }: { block: Block; context: BlockContext }) {
  switch (block.type) {
    case 'text':
      return <TextBlockView block={block} context={context} />
    case 'math':
      return <MathBlockView block={block} />
    case 'table':
      return <TableBlockView block={block} />
    case 'relation':
      return <RelationBlockView block={block} />
    case 'code':
      return <CodeBlockView block={block} />
    case 'er':
      return <ErBlockView block={block} />
    case 'graph':
      return <GraphBlockView block={block} />
    case 'chart':
      return <ChartBlockView block={block} />
    case 'image':
      return <ImageBlockView block={block} context={context} />
    default:
      return null
  }
}

/** Caption shown under figures — one shared style so every block type matches. */
export function FigureCaption({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return <figcaption className="mt-2 text-meta text-ink-muted">{children}</figcaption>
}
