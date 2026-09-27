import { getSeoCatalogue } from '@/lib/seo/catalogue'
import { absolute } from '@/lib/seo/site'

/**
 * A course by its official code — /course/BSMA1001, /course/bscs2002 — to
 * its papers. Codes are printed on every paper and course page, so they
 * turn up in links and bookmarks even if nobody types them into a search.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.trim().toUpperCase()
  const { subjects } = await getSeoCatalogue()
  const node = subjects.find((entry) => entry.subject.code?.toUpperCase() === code && entry.paperCount > 0)
  if (!node) return new Response('No course with that code has papers here.', { status: 404 })
  return Response.redirect(absolute(node.path), 308)
}
