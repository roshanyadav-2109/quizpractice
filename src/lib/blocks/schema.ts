/**
 * The content block model.
 *
 * A question body is not a string and not a picture: it is an ordered array of
 * typed blocks. A DBMS relation is columns and rows with data types and keys, a
 * truth table is a table, an equation is LaTeX, an ER diagram is entities and
 * relationships. The frontend draws all of it, so it is searchable, responsive,
 * selectable, correct in both themes, and fixable without redrawing anything.
 *
 * `image` is the deliberate escape hatch, for content whose meaning is spatial
 * rather than structural: circuit diagrams, waveforms, geometry figures. It
 * requires alt text so those questions stay searchable too.
 *
 * This mirrors schema/question-paper.schema.json, which is the language-neutral
 * contract used by the importer and by the vision extraction prompt.
 */
import { z } from 'zod'

export const SCHEMA_VERSION = 1

// ---------------------------------------------------------------------------
// Media reference
// ---------------------------------------------------------------------------

/**
 * We store the Cloudinary public_id, never a delivery URL, so the cloud name,
 * CDN and transformation string can all change without a data migration.
 */
export const cloudinaryRefSchema = z.object({
  provider: z.literal('cloudinary').optional(),
  public_id: z.string().min(1),
  version: z.number().int().optional(),
  format: z.string().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  /**
   * "original" serves the file exactly as uploaded, with no resizing or format
   * conversion - for images already optimised before upload, so each one costs
   * no transformations. width and height are then its display size.
   */
  delivery: z.literal('original').optional(),
  /** The Cloudinary cloud holding the asset, when it is not the site's own. */
  cloud: z.string().min(1).optional(),
  /**
   * Show only this part of the asset: a sheet holding many figures, in the
   * sheet's pixels. width and height above are then the figure's display size.
   */
  region: z
    .object({
      x: z.number().int().nonnegative(),
      y: z.number().int().nonnegative(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      sheet_width: z.number().int().positive(),
      sheet_height: z.number().int().positive(),
    })
    .optional(),
  /**
   * Import-time only: where to fetch this image from if it is not in Cloudinary
   * yet. The importer uploads it to `public_id`, fills in the dimensions and
   * strips this field, so stored content never carries a foreign URL.
   */
  source_url: z.string().optional(),
})

export type CloudinaryRef = z.infer<typeof cloudinaryRefSchema>

/** Present on every structured block: ship a picture now, upgrade to structure later. */
const withFallback = { fallback_image: cloudinaryRefSchema.optional() }

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export const textBlockSchema = z.object({
  type: z.literal('text'),
  /** Markdown. Inline maths in $...$ renders through KaTeX. */
  md: z.string(),
})

export const mathBlockSchema = z.object({
  type: z.literal('math'),
  latex: z.string(),
  ...withFallback,
})

const cellSchema = z.union([z.string(), z.number(), z.null()])

export const tableBlockSchema = z.object({
  type: z.literal('table'),
  caption: z.string().optional(),
  columns: z.array(z.string()).min(1),
  rows: z.array(z.array(cellSchema)),
  align: z.array(z.enum(['left', 'center', 'right'])).optional(),
  ...withFallback,
})

export const relationColumnSchema = z.object({
  name: z.string(),
  data_type: z.string().optional(),
  primary_key: z.boolean().optional(),
  /** Target written as 'Relation.column', e.g. 'Student.roll_no'. */
  foreign_key: z.string().optional(),
  nullable: z.boolean().optional(),
})

export const relationBlockSchema = z.object({
  type: z.literal('relation'),
  name: z.string(),
  columns: z.array(relationColumnSchema).min(1),
  rows: z.array(z.array(cellSchema)).optional(),
  ...withFallback,
})

export const codeBlockSchema = z.object({
  type: z.literal('code'),
  language: z.string(),
  source: z.string(),
  filename: z.string().optional(),
  highlight_lines: z.array(z.number().int().positive()).optional(),
  ...withFallback,
})

export const erEntitySchema = z.object({
  name: z.string(),
  weak: z.boolean().optional(),
  attributes: z
    .array(
      z.object({
        name: z.string(),
        key: z.enum(['primary', 'partial', 'foreign', 'none']).optional(),
        multivalued: z.boolean().optional(),
        derived: z.boolean().optional(),
      }),
    )
    .optional(),
})

export const erRelationshipSchema = z.object({
  name: z.string().optional(),
  from: z.string(),
  to: z.string(),
  cardinality: z.enum(['1:1', '1:N', 'N:1', 'M:N']).optional(),
  total_participation: z.boolean().optional(),
})

export const erBlockSchema = z.object({
  type: z.literal('er'),
  caption: z.string().optional(),
  entities: z.array(erEntitySchema).min(1),
  relationships: z.array(erRelationshipSchema).optional(),
  ...withFallback,
})

export const graphBlockSchema = z.object({
  type: z.literal('graph'),
  caption: z.string().optional(),
  directed: z.boolean().optional(),
  layout: z.enum(['tree', 'force', 'flow', 'circular']).optional(),
  nodes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string().optional(),
        shape: z.enum(['circle', 'box', 'diamond', 'rounded']).optional(),
      }),
    )
    .min(1),
  edges: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        weight: z.union([z.number(), z.string()]).optional(),
        label: z.string().optional(),
      }),
    )
    .optional(),
  ...withFallback,
})

export const chartBlockSchema = z.object({
  type: z.literal('chart'),
  kind: z.enum(['bar', 'line', 'scatter', 'histogram', 'pie', 'box']),
  caption: z.string().optional(),
  x_label: z.string().optional(),
  y_label: z.string().optional(),
  categories: z.array(z.union([z.string(), z.number()])).optional(),
  series: z
    .array(
      z.object({
        name: z.string().optional(),
        values: z.array(z.union([z.number(), z.null()])),
      }),
    )
    .min(1),
  ...withFallback,
})

export const imageBlockSchema = z.object({
  type: z.literal('image'),
  image: cloudinaryRefSchema,
  /** Required: keeps image questions searchable and accessible. */
  alt: z.string().min(1),
  caption: z.string().optional(),
})

export const blockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  mathBlockSchema,
  tableBlockSchema,
  relationBlockSchema,
  codeBlockSchema,
  erBlockSchema,
  graphBlockSchema,
  chartBlockSchema,
  imageBlockSchema,
])

export const blocksSchema = z.array(blockSchema)

export type Block = z.infer<typeof blockSchema>
export type BlockType = Block['type']
export type TextBlock = z.infer<typeof textBlockSchema>
export type MathBlock = z.infer<typeof mathBlockSchema>
export type TableBlock = z.infer<typeof tableBlockSchema>
export type RelationBlock = z.infer<typeof relationBlockSchema>
export type CodeBlock = z.infer<typeof codeBlockSchema>
export type ErBlock = z.infer<typeof erBlockSchema>
export type GraphBlock = z.infer<typeof graphBlockSchema>
export type ChartBlock = z.infer<typeof chartBlockSchema>
export type ImageBlock = z.infer<typeof imageBlockSchema>

export const BLOCK_TYPES: BlockType[] = [
  'text',
  'math',
  'table',
  'relation',
  'code',
  'er',
  'graph',
  'chart',
  'image',
]

/** Human labels for the admin editor's block picker. */
export const BLOCK_LABELS: Record<BlockType, string> = {
  text: 'Text',
  math: 'Equation',
  table: 'Table',
  relation: 'Database relation',
  code: 'Code',
  er: 'ER diagram',
  graph: 'Graph or tree',
  chart: 'Chart',
  image: 'Image',
}

// ---------------------------------------------------------------------------
// Questions, options, solutions, papers
// ---------------------------------------------------------------------------

export const questionTypeSchema = z.enum([
  'mcq',
  'msq',
  'numerical',
  'subjective',
  'programming',
])

export type QuestionType = z.infer<typeof questionTypeSchema>

export const optionSchema = z.object({
  label: z.string(),
  /** Options are block arrays too — an option can be a table or a diagram. */
  content: blocksSchema.min(1),
  is_correct: z.boolean().optional(),
})

export const solutionSchema = z.object({
  body: blocksSchema.optional(),
  video_url: z.string().url().optional(),
  kind: z.enum(['official', 'authored', 'community', 'ai']).optional(),
})

export const provenanceSchema = z.object({
  image: cloudinaryRefSchema.optional(),
  extracted_by: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  reviewed: z.boolean().optional(),
})

export const importQuestionSchema = z
  .object({
    number: z.number().int().positive(),
    type: questionTypeSchema,
    marks: z.number().min(0).optional(),
    negative_marks: z.number().min(0).optional(),
    body: blocksSchema.min(1),
    options: z.array(optionSchema).optional(),
    correct_answer: z.union([z.string(), z.number()]).optional(),
    answer_tolerance: z.number().min(0).optional(),
    solution: solutionSchema.optional(),
    topics: z.array(z.string()).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    source: provenanceSchema.optional(),
  })
  .superRefine((question, ctx) => {
    const choice = question.type === 'mcq' || question.type === 'msq'

    if (choice) {
      if (!question.options || question.options.length < 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['options'],
          message: `Question ${question.number} is ${question.type} and needs at least two options.`,
        })
        return
      }
      const correct = question.options.filter((o) => o.is_correct).length
      if (correct === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['options'],
          message: `Question ${question.number} has no option marked is_correct.`,
        })
      }
      if (question.type === 'mcq' && correct > 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['options'],
          message: `Question ${question.number} is mcq but marks ${correct} options correct — use msq instead.`,
        })
      }
    }

    if (question.type === 'numerical' && question.correct_answer === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['correct_answer'],
        message: `Question ${question.number} is numerical and needs a correct_answer.`,
      })
    }
  })

export const importPaperSchema = z.object({
  schema_version: z.number().int().optional(),
  subject: z.string().min(1),
  exam_type: z.string().min(1),
  session_date: z.string().optional(),
  set_code: z.string().optional(),
  title: z.string().optional(),
  duration_minutes: z.number().int().positive().optional(),
  total_marks: z.number().min(0).optional(),
  source: provenanceSchema.optional(),
  questions: z.array(importQuestionSchema).min(1),
})

export type ImportPaper = z.infer<typeof importPaperSchema>
export type ImportQuestion = z.infer<typeof importPaperSchema>['questions'][number]
export type ImportOption = z.infer<typeof optionSchema>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parses unknown jsonb from the database into blocks, dropping anything invalid. */
export function parseBlocks(value: unknown): Block[] {
  const result = blocksSchema.safeParse(value)
  if (result.success) return result.data

  // A single malformed block should degrade that block, not blank the question.
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const single = blockSchema.safeParse(item)
      return single.success ? [single.data] : []
    })
  }
  return []
}

/**
 * Flattens blocks to plain text for previews, share cards and meta
 * descriptions. Mirrors what jsonb_deep_text does in Postgres for search.
 */
export function blocksToText(blocks: Block[]): string {
  const parts: string[] = []

  for (const block of blocks) {
    switch (block.type) {
      case 'text':
        parts.push(block.md)
        break
      case 'math':
        parts.push(block.latex)
        break
      case 'table':
        if (block.caption) parts.push(block.caption)
        parts.push(block.columns.join(' '))
        parts.push(block.rows.map((row) => row.join(' ')).join(' '))
        break
      case 'relation':
        parts.push(block.name)
        parts.push(block.columns.map((c) => c.name).join(' '))
        if (block.rows) parts.push(block.rows.map((row) => row.join(' ')).join(' '))
        break
      case 'code':
        parts.push(block.source)
        break
      case 'er':
        if (block.caption) parts.push(block.caption)
        parts.push(block.entities.map((e) => e.name).join(' '))
        break
      case 'graph':
        if (block.caption) parts.push(block.caption)
        parts.push(block.nodes.map((n) => n.label ?? n.id).join(' '))
        break
      case 'chart':
        if (block.caption) parts.push(block.caption)
        if (block.x_label) parts.push(block.x_label)
        if (block.y_label) parts.push(block.y_label)
        break
      case 'image':
        parts.push(block.alt)
        if (block.caption) parts.push(block.caption)
        break
    }
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/** Every Cloudinary public_id referenced anywhere in a block array. */
export function collectPublicIds(blocks: Block[]): string[] {
  const ids: string[] = []
  for (const block of blocks) {
    if (block.type === 'image') {
      ids.push(block.image.public_id)
    } else if ('fallback_image' in block && block.fallback_image) {
      ids.push(block.fallback_image.public_id)
    }
  }
  return ids
}
