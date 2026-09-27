import 'server-only'
import { getSeoCatalogue, type LevelNode, type ProgramNode, type SeoCatalogue } from './catalogue'

/** A programme by its address word ("data-science"), or by its old internal slug ("ds"). */
export async function findProgram(slug: string): Promise<{ catalogue: SeoCatalogue; program: ProgramNode } | null> {
  const catalogue = await getSeoCatalogue()
  const program = catalogue.programs.find((entry) => entry.slug === slug || entry.program.slug === slug)
  if (!program || !program.levels.some((level) => level.subjects.some((subject) => subject.paperCount > 0))) return null
  return { catalogue, program }
}

export function levelWithPapers(program: ProgramNode, slug: string): LevelNode | null {
  const level = program.levels.find((entry) => entry.level.slug === slug)
  return level && level.subjects.some((subject) => subject.paperCount > 0) ? level : null
}
