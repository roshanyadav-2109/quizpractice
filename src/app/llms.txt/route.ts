import { llmsTxt } from '@/lib/seo/llms'
import { textResponse } from '@/lib/seo/xml-response'

/** The site described for AI agents (llmstxt.org). */
export async function GET() {
  return textResponse(await llmsTxt())
}
