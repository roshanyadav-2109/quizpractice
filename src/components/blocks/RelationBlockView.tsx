import type { RelationBlock } from '@/lib/blocks/schema'

/**
 * A database relation: schema and, when the question gives one, its instance.
 *
 * This is the block DBMS papers lean on hardest. Rendering it from structure
 * rather than as a cropped screenshot means the primary key is genuinely marked
 * up (underlined, as the notation requires), types are legible, foreign keys
 * name their target, and the whole thing scrolls properly on a phone.
 */
export function RelationBlockView({ block }: { block: RelationBlock }) {
  const hasRows = Boolean(block.rows?.length)

  return (
    <figure className="my-2">
      <div className="overflow-hidden rounded-control border border-rule">
        <div className="flex items-baseline gap-2 border-b border-rule bg-surface-2 px-3 py-2">
          <span className="font-mono text-[0.875rem] text-ink">{block.name}</span>
          <span className="text-meta text-ink-faint">
            {block.columns.length} attribute{block.columns.length === 1 ? '' : 's'}
            {hasRows ? ` · ${block.rows!.length} row${block.rows!.length === 1 ? '' : 's'}` : ''}
          </span>
        </div>

        <div className="relative overflow-x-auto">
          <table className="w-full border-collapse text-[0.9375rem] tabular-nums">
            <thead>
              <tr className="bg-surface-2">
                {block.columns.map((column) => (
                  <th
                    key={column.name}
                    scope="col"
                    className="border-b border-rule px-3 py-2 text-left align-bottom whitespace-nowrap"
                  >
                    <span
                      className={`block  text-ink ${
                        column.primary_key ? 'underline decoration-2 underline-offset-4' : ''
                      }`}
                    >
                      {column.name}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      {column.data_type ? (
                        <span className="font-mono text-[0.75rem] font-normal text-ink-muted">
                          {column.data_type}
                        </span>
                      ) : null}
                      {column.primary_key ? <KeyBadge>PK</KeyBadge> : null}
                      {column.foreign_key ? (
                        <KeyBadge title={`references ${column.foreign_key}`}>
                          FK → {column.foreign_key}
                        </KeyBadge>
                      ) : null}
                      {column.nullable === false && !column.primary_key ? (
                        <span className="text-[0.75rem] font-normal text-ink-faint">NOT NULL</span>
                      ) : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            {hasRows ? (
              <tbody>
                {block.rows!.map((row, rowIndex) => (
                  <tr key={rowIndex} className="even:bg-surface-2/40">
                    {block.columns.map((column, colIndex) => {
                      const cell = row[colIndex]
                      return (
                        <td
                          key={column.name}
                          className={`border-t border-rule px-2.5 py-1 text-ink ${
                            typeof cell === 'number' ? 'text-right tabular-nums' : ''
                          }`}
                        >
                          {cell === null || cell === undefined ? (
                            <span className="text-ink-faint italic">NULL</span>
                          ) : (
                            String(cell)
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            ) : null}
          </table>
        </div>

        {!hasRows ? (
          <p className="border-t border-rule px-2.5 py-1.5 text-[0.75rem] text-ink-muted">
            Schema only — this question does not supply an instance.
          </p>
        ) : null}
      </div>
    </figure>
  )
}

function KeyBadge({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="rounded-[2px] bg-accent px-1 py-px font-mono text-[0.59375rem] text-accent-ink"
    >
      {children}
    </span>
  )
}
