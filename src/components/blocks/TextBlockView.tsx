import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import type { TextBlock } from '@/lib/blocks/schema'
import { remarkUnderline } from '@/lib/blocks/remark-underline'
import type { BlockContext } from './BlockRenderer'

/**
 * Question prose, set in the serif.
 *
 * This is the point where the paper and the application visibly part company:
 * everything that came off a real question paper is a serif, everything the app
 * itself says is the grotesque. Inline maths and code identifiers are
 * first-class here rather than being flattened into a picture.
 */
export function TextBlockView({
  block,
  context = 'question',
}: {
  block: TextBlock
  context?: BlockContext
}) {
  const size = context === 'question' ? 'paper' : 'paper-sm'

  // Prose is held to a readable measure. Tables, diagrams and charts are not —
  // they keep the full column, because a relation with six attributes needs it.
  return (
    <div className={`${size} max-w-[68ch] text-ink`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkUnderline]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          u: ({ children }) => <u className="underline underline-offset-2">{children}</u>,
          strong: ({ children }) => (
            <strong className="font-medium text-ink">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          code: ({ children }) => (
            <code className="rounded-[4px] bg-surface-2 px-1.5 py-px font-mono text-[0.86em] text-ink">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="mb-2 overflow-x-auto rounded-control border border-rule bg-surface-2 p-3 font-mono text-[0.875rem]">
              {children}
            </pre>
          ),
          ul: ({ children }) => (
            <ul className="mb-2 list-disc space-y-0.5 pl-5 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal space-y-0.5 pl-5 last:mb-0">{children}</ol>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-accent underline underline-offset-2 hover:text-accent-hover"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-2 border-l-2 border-rule-strong pl-3 text-ink-muted">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto">
              <table className="w-full border-collapse text-[0.9375rem] tabular-nums">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-rule bg-surface-2 px-3 py-2 text-left">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-rule px-3 py-2">{children}</td>
          ),
        }}
      >
        {block.md}
      </ReactMarkdown>
    </div>
  )
}
