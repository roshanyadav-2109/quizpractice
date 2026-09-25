import katex from 'katex'
import type { MathBlock } from '@/lib/blocks/schema'

/**
 * Display-mode equation. Rendered to HTML on the server so it is sharp at any
 * zoom, selectable, and readable by screen readers via KaTeX's MathML output —
 * none of which is true of the equation screenshots these questions arrive as.
 */
export function MathBlockView({ block }: { block: MathBlock }) {
  let html: string
  try {
    html = katex.renderToString(block.latex, {
      displayMode: true,
      throwOnError: false,
      output: 'htmlAndMathml',
      strict: false,
    })
  } catch {
    // Malformed LaTeX should show the source, not blank the question.
    return (
      <pre className="overflow-x-auto rounded-control border border-rule bg-surface-2 p-3 font-mono text-[0.875rem] text-ink-muted">
        {block.latex}
      </pre>
    )
  }

  return (
    <div
      className="overflow-x-auto py-1 text-center"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
