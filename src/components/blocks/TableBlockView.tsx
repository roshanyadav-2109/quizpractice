import type { TableBlock } from '@/lib/blocks/schema'
import { FigureCaption } from './BlockRenderer'

/**
 * Generic tabular data: truth tables, K-maps, data sets, comparison tables.
 * Numeric columns right-align with tabular figures so digits line up the way
 * they do on the printed paper.
 */
export function TableBlockView({ block }: { block: TableBlock }) {
  const alignment = block.columns.map((_, index) => {
    if (block.align?.[index]) return block.align[index]

    const cells = block.rows.map((row) => row[index]).filter((c) => c !== null && c !== '')
    const numeric = cells.length > 0 && cells.every((c) => typeof c === 'number')
    if (!numeric) return 'left'

    // Long numbers line up on the right so magnitudes compare. Short ones —
    // the 0s and 1s of a truth table or K-map — read far better centred than
    // stranded at the right edge of a wide column.
    const widest = Math.max(...cells.map((cell) => String(cell).length))
    return widest <= 3 ? 'center' : 'right'
  })

  return (
    <figure className="my-2">
      <div className="relative overflow-x-auto rounded-control border border-rule">
        <table className="w-full border-collapse text-[0.9375rem] tabular-nums">
          <thead>
            <tr className="bg-surface-2">
              {block.columns.map((column, index) => (
                <th
                  key={index}
                  scope="col"
                  className="border-b border-rule px-3 py-2 text-left whitespace-nowrap text-ink"
                  style={{ textAlign: alignment[index] }}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="even:bg-surface-2/40">
                {block.columns.map((_, colIndex) => {
                  const cell = row[colIndex]
                  return (
                    <td
                      key={colIndex}
                      className={`border-t border-rule px-2.5 py-1 text-ink ${
                        alignment[colIndex] === 'left' ? '' : 'tabular-nums'
                      }`}
                      style={{ textAlign: alignment[colIndex] }}
                    >
                      {cell === null || cell === undefined ? (
                        <span className="text-ink-faint">—</span>
                      ) : (
                        String(cell)
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <FigureCaption>{block.caption}</FigureCaption>
    </figure>
  )
}
