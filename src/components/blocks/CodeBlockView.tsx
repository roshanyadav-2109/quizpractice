'use client'

import { Highlight } from 'prism-react-renderer'
import type { CodeBlock } from '@/lib/blocks/schema'

/**
 * Syntax-highlighted code.
 *
 * The library ships themes as fixed inline styles, which would be wrong in one
 * of the two colour schemes. We take its tokens and apply our own classes
 * instead, so highlighting follows the theme like everything else on the page.
 */
export function CodeBlockView({ block }: { block: CodeBlock }) {
  const highlighted = new Set(block.highlight_lines ?? [])
  const source = block.source.replace(/\s+$/, '')

  return (
    <figure className="my-2 overflow-hidden rounded-control border border-rule">
      <div className="flex items-center justify-between gap-3 border-b border-rule bg-surface-2 px-3 py-1.5">
        <span className="truncate text-meta text-ink-muted">
          {block.filename ?? block.language}
        </span>
        {block.filename ? (
          <span className="shrink-0 text-meta text-ink-faint">{block.language}</span>
        ) : null}
      </div>

      <Highlight code={source} language={block.language}>
        {({ tokens }) => (
          <pre className="overflow-x-auto bg-surface p-3 font-mono text-[0.875rem] leading-[1.6]">
            <code>
              {tokens.map((line, lineIndex) => (
                <div
                  key={lineIndex}
                  className={`flex ${highlighted.has(lineIndex + 1) ? 'bg-marked-soft' : ''}`}
                >
                  <span
                    aria-hidden
                    className="mr-3 w-6 shrink-0 select-none text-right text-ink-faint tabular-nums"
                  >
                    {lineIndex + 1}
                  </span>
                  <span className="flex-1 whitespace-pre">
                    {line.map((token, tokenIndex) => (
                      <span key={tokenIndex} className={tokenClass(token.types)}>
                        {token.content}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </code>
          </pre>
        )}
      </Highlight>
    </figure>
  )
}

function tokenClass(types: string[]): string {
  if (types.includes('comment') || types.includes('prolog') || types.includes('doctype')) {
    return 'tok-comment'
  }
  if (types.includes('string') || types.includes('char') || types.includes('attr-value')) {
    return 'tok-string'
  }
  if (types.includes('keyword') || types.includes('boolean') || types.includes('atrule')) {
    return 'tok-keyword'
  }
  if (types.includes('number') || types.includes('constant')) {
    return 'tok-number'
  }
  if (
    types.includes('function') ||
    types.includes('class-name') ||
    types.includes('builtin') ||
    types.includes('tag')
  ) {
    return 'tok-function'
  }
  if (types.includes('operator') || types.includes('punctuation')) {
    return 'tok-punct'
  }
  if (types.includes('property') || types.includes('attr-name') || types.includes('variable')) {
    return 'tok-name'
  }
  return ''
}
