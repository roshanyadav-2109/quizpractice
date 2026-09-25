import type { Nodes, Parent, Root, RootContent } from 'mdast'

/**
 * Underline in question text, written as `<u>…</u>`.
 *
 * Markdown has no underline, and papers use it with meaning: "identify the
 * part of speech of the underlined word". Raw HTML stays off, so this looks
 * only for a `<u>` and a `</u>` among one paragraph's inline nodes and wraps
 * what lies between them in a real `<u>`; any other tag is left alone, and an
 * unmatched `<u>` is dropped rather than shown.
 */
export function remarkUnderline() {
  return (tree: Root) => {
    visit(tree)
  }
}

const OPEN = /^<u>$/i
const CLOSE = /^<\/u>$/i

function visit(node: Nodes) {
  if (!('children' in node)) return
  const parent = node as Parent
  const out: RootContent[] = []
  let open: RootContent[] | null = null

  for (const child of parent.children) {
    if (child.type === 'html' && OPEN.test(child.value.trim())) {
      open = []
      continue
    }
    if (child.type === 'html' && CLOSE.test(child.value.trim()) && open) {
      // Emphasis renamed: mdast has no underline node, and hName is how a
      // node chooses the element it becomes.
      out.push({ type: 'emphasis', children: open as never, data: { hName: 'u' } })
      open = null
      continue
    }
    visit(child)
    ;(open ?? out).push(child)
  }
  if (open) out.push(...open)
  parent.children = out
}
