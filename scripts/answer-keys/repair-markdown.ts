/**
 * Removes the hard breaks that must not be there: a trailing backslash on a
 * table row (it stops "| a | b |" from being a table row), and one on a prose
 * line directly before a table, blockquote, heading or fence (those need a
 * blank line to start). Every other hard break is a real line break and stays.
 */
export function repairMarkdown(md: string): string {
  const lines = md.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const next = lines[i + 1]
    const hardBreak = line.endsWith('\\') && !line.endsWith('\\\\')
    if (!hardBreak || next === undefined) {
      out.push(line)
      continue
    }
    if (/^\s*\|/.test(line)) {
      out.push(line.slice(0, -1).trimEnd())
      continue
    }
    if (!/^\s*>/.test(line) && /^\s*(\||>|#{1,6}\s|```|~~~)/.test(next)) {
      out.push(line.slice(0, -1).trimEnd(), '')
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}
