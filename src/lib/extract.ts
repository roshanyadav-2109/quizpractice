import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { blocksSchema, importPaperSchema, type Block, type ImportPaper } from '@/lib/blocks/schema'

/**
 * Turns a scanned or photographed question paper into content blocks.
 *
 * This is what makes "JSON, not pictures" tractable at scale: the block schema
 * doubles as the extraction contract, so a vision pass produces the same shape
 * the importer already validates.
 *
 * Two deliberate choices:
 *
 *  - The canonical JSON Schema file is sent as the contract rather than a prose
 *    description, so there is one source of truth for what a block is. It sits
 *    at the front of the system prompt behind a cache breakpoint, because it is
 *    identical on every call and would otherwise be re-billed per page.
 *
 *  - The model's output is parsed and then validated with the same Zod schema
 *    the importer uses. Extraction is not trusted; nothing reaches the database
 *    without passing that check and then a human review.
 */

const MODEL = 'claude-opus-5'

export interface ExtractionInput {
  /** Raw image bytes of one page or one question. */
  image: Buffer | Uint8Array
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
  subject: string
  examType: string
  sessionDate?: string | null
  setCode?: string | null
  /** Extra context that helps, e.g. "questions 7 to 12 only". */
  hint?: string
}

export interface ExtractionOutput {
  paper: ImportPaper
  confidence: number
  perQuestionConfidence: Record<number, number>
  notes: string[]
  raw: unknown
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number }
}

export class ExtractionError extends Error {
  readonly raw: unknown
  constructor(message: string, raw: unknown = null) {
    super(message)
    this.name = 'ExtractionError'
    this.raw = raw
  }
}

let cachedSchema: string | null = null

function blockSchemaText(): string {
  if (cachedSchema) return cachedSchema
  cachedSchema = readFileSync(
    join(process.cwd(), 'schema', 'question-paper.schema.json'),
    'utf8',
  )
  return cachedSchema
}

const SYSTEM_INSTRUCTIONS = `
You transcribe exam question papers from the IIT Madras BS degree into structured JSON.

Your job is transcription, not authoring. Reproduce exactly what the paper says.
Never invent a question, an option, or a value that is not visible in the image.

Rules that matter most:

1. Represent content as structured blocks wherever it is made of text and
   structure. A relation goes in a "relation" block with its columns, data types
   and keys. A truth table, K-map or data set goes in a "table" block. Code goes
   in a "code" block with its language. An equation goes in a "math" block as
   LaTeX. An ER diagram goes in an "er" block with entities and relationships. A
   graph or tree goes in a "graph" block with nodes and edges.

2. Use an "image" block ONLY when the figure's meaning is spatial or analog and
   cannot be reconstructed from data: circuit diagrams, waveforms, oscilloscope
   traces, geometry figures, screenshots, hand-drawn sketches. When you do,
   write a genuinely descriptive "alt" that says what the figure shows, and set
   image.public_id to a short slug like "q07-fig1". Never guess at a Cloudinary
   path.

3. Mark the correct option with is_correct ONLY when the paper itself indicates
   it (an answer key, a highlighted option, a marked bubble). If the correct
   answer is not shown, omit is_correct entirely rather than solving the
   question yourself.

4. If any part of a question is unreadable, still transcribe what you can, give
   that question a low confidence, and say what was unreadable in its "notes".

5. Preserve the question numbering from the paper. Preserve mark values exactly.

Return confidence per question as a number from 0 to 1: how sure you are that
the transcription is faithful and complete. Be honest and use the low end — a
question you partly guessed at is below 0.5.
`.trim()

export async function extractQuestions(
  input: ExtractionInput,
  apiKey: string,
): Promise<ExtractionOutput> {
  const client = new Anthropic({ apiKey })

  const contract = `
Produce a single JSON object matching this JSON Schema, with two additions to
each question object: a "confidence" number and an optional "notes" string.

${blockSchemaText()}
`.trim()

  const task = [
    `subject: ${input.subject}`,
    `exam_type: ${input.examType}`,
    input.sessionDate ? `session_date: ${input.sessionDate}` : null,
    input.setCode ? `set_code: ${input.setCode}` : null,
    input.hint ? `note: ${input.hint}` : null,
    '',
    'Transcribe every question visible in this image.',
    'Reply with JSON only — no prose, no markdown fences.',
  ]
    .filter(Boolean)
    .join('\n')

  // Streaming: a dense page of questions can run long, and a non-streaming
  // request with a large max_tokens risks an HTTP timeout.
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    system: [
      {
        type: 'text',
        text: SYSTEM_INSTRUCTIONS,
      },
      {
        type: 'text',
        text: contract,
        // Identical on every page; caching it keeps bulk extraction affordable.
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: input.mediaType,
              data: Buffer.from(input.image).toString('base64'),
            },
          },
          { type: 'text', text: task },
        ],
      },
    ],
  })

  const message = await stream.finalMessage()

  if (message.stop_reason === 'refusal') {
    throw new ExtractionError(
      `The model declined this image${
        message.stop_details && 'category' in message.stop_details
          ? ` (${message.stop_details.category})`
          : ''
      }.`,
    )
  }

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim()

  const parsed = parseJsonPayload(text)

  // Strip the per-question extras before validating against the import schema,
  // keeping them for the review queue.
  const perQuestionConfidence: Record<number, number> = {}
  const notes: string[] = []

  const record = parsed as { questions?: unknown[] }
  if (Array.isArray(record.questions)) {
    record.questions = record.questions.map((rawQuestion) => {
      const question = { ...(rawQuestion as Record<string, unknown>) }
      const number = Number(question.number)

      if (typeof question.confidence === 'number' && Number.isFinite(number)) {
        perQuestionConfidence[number] = question.confidence
      }
      if (typeof question.notes === 'string' && question.notes.trim()) {
        notes.push(`Q${question.number}: ${question.notes.trim()}`)
      }

      delete question.confidence
      delete question.notes
      return question
    })
  }

  const withDefaults = {
    schema_version: 1,
    subject: input.subject,
    exam_type: input.examType,
    session_date: input.sessionDate ?? undefined,
    set_code: input.setCode ?? undefined,
    ...(parsed as object),
  }

  const validated = importPaperSchema.safeParse(withDefaults)
  if (!validated.success) {
    throw new ExtractionError(
      `The extracted JSON did not match the block schema: ${validated.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`)
        .join('; ')}`,
      parsed,
    )
  }

  const confidences = Object.values(perQuestionConfidence)
  const confidence = confidences.length
    ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    : 0.5

  return {
    paper: validated.data,
    confidence,
    perQuestionConfidence,
    notes,
    raw: parsed,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    },
  }
}

/**
 * Models occasionally wrap JSON in a fence despite being told not to. Recover
 * from that rather than failing an otherwise good extraction.
 */
function parseJsonPayload(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = (fenced ? fenced[1] : text).trim()

  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        // fall through
      }
    }
    throw new ExtractionError('The model did not return parseable JSON.', text)
  }
}

// ---------------------------------------------------------------------------
// Fragment mode
// ---------------------------------------------------------------------------

const FRAGMENT_INSTRUCTIONS = `
You convert a single cropped image from an exam question into content blocks.

These images are fragments, not whole questions: a relation table, a code
listing, an equation, a diagram, or one multiple-choice option. Return ONLY the
blocks for what is in this image — no surrounding prose, no invented question
stem, no options unless the image itself is an option list.

Rules:

1. A table of data with a relation name is a "relation" block. Carry the column
   names, and the data types and key markings when the image shows them. An
   empty cell showing NULL is the value null, never the string "NULL" and never
   zero — that distinction is usually the entire point of the question.

2. A plain grid of values with no relation name is a "table" block.

3. Code or SQL is a "code" block with its language. Preserve line breaks and
   indentation exactly; do not reformat, reindent or "tidy" it.

4. An equation is a "math" block as LaTeX.

5. An entity-relationship diagram is an "er" block with entities, attributes,
   key markings and cardinalities.

6. A graph, tree or flowchart is a "graph" block with nodes and edges.

7. Use an "image" block ONLY when the content is genuinely spatial and cannot be
   reconstructed as data: a circuit diagram, a waveform, a geometry figure, a
   screenshot. Set image.public_id to the placeholder "PENDING_UPLOAD" and write
   a genuinely descriptive alt.

Transcribe what is there. Do not solve, extend or correct the content, and do
not guess at values that are cut off — if something is unreadable, say so in
"notes" and give a low confidence.
`.trim()

export interface FragmentResult {
  blocks: Block[]
  confidence: number
  notes: string | null
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number }
}

export interface FragmentInput {
  image: Buffer | Uint8Array
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp'
  /** e.g. "a multiple-choice option" or "the question stem". Improves accuracy. */
  hint?: string
}

/**
 * The request for one fragment. Shared by the one-at-a-time converter and the
 * Message Batches run, so both send the same instructions, the same cached
 * schema and the same image framing.
 */
export function fragmentRequest(input: FragmentInput): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: [
      { type: 'text', text: FRAGMENT_INSTRUCTIONS },
      {
        type: 'text',
        text: `Return a JSON object: {"blocks": [...], "confidence": 0..1, "notes": "..."}.
Blocks follow this schema:

${blockSchemaText()}`,
        // Identical on every fragment; caching it is what makes a bank-sized
        // migration affordable rather than merely possible.
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: input.mediaType,
              data: Buffer.from(input.image).toString('base64'),
            },
          },
          {
            type: 'text',
            text: input.hint
              ? `This image is ${input.hint}. Convert it to blocks.`
              : 'Convert this image to blocks. Reply with JSON only.',
          },
        ],
      },
    ],
  }
}

/** Checks one fragment reply: parsed, and every block valid against the schema. */
export function fragmentResult(message: Anthropic.Message): FragmentResult {
  if (message.stop_reason === 'refusal') {
    throw new ExtractionError('The model declined this image.')
  }

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim()

  const parsed = parseJsonPayload(text) as {
    blocks?: unknown
    confidence?: number
    notes?: string
  }

  const blocks = blocksSchema.safeParse(parsed.blocks)
  if (!blocks.success) {
    throw new ExtractionError(
      `Extracted blocks did not validate: ${blocks.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`)
        .join('; ')}`,
      parsed,
    )
  }

  return {
    blocks: blocks.data,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    notes: typeof parsed.notes === 'string' && parsed.notes.trim() ? parsed.notes : null,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    },
  }
}

/**
 * Converts one cropped image — a table, a code listing, an option — into blocks.
 *
 * This is the workhorse for migrating a question bank that stores its content
 * as pictures: the metadata (subject, marks, which option is correct) comes
 * from wherever it already lives, and only the pixels come through here.
 */
export async function extractBlocksFromImage(input: FragmentInput, apiKey: string): Promise<FragmentResult> {
  const client = new Anthropic({ apiKey })
  const message = await client.messages.stream(fragmentRequest(input)).finalMessage()
  return fragmentResult(message)
}
