/**
 * Structured data for one page, as a JSON-LD script. `<` is escaped so no
 * string in the data — a question's text, a subject's name — can close the
 * script tag early.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}
