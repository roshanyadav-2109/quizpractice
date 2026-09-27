import { llmsFullTxt } from '@/lib/seo/llms'
import { textResponse } from '@/lib/seo/xml-response'

/** llms.txt, plus every paper on its own line. */
export async function GET() {
  return textResponse(await llmsFullTxt())
}
