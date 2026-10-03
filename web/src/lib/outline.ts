import type { Book, Outline, OutlineNode } from './types'

/** Browser-side key for a section path. */
export function sectionKey(path: string[]): string {
  return JSON.stringify(path)
}

/** Flattens an outline in reading order. Entries with children are headings, the rest sections. */
export function outlineNodes(outline: Outline | null): OutlineNode[] {
  const nodes: OutlineNode[] = []
  const walk = (entries: Outline, prefix: string[]) => {
    for (const [title, value] of Object.entries(entries)) {
      const path = [...prefix, title]
      const hasChildren = typeof value === 'object' && value !== null && Object.keys(value).length > 0
      nodes.push({
        key: sectionKey(path),
        path,
        title,
        description: typeof value === 'string' ? value : '',
        depth: path.length,
        isSection: !hasChildren,
      })
      if (hasChildren) walk(value as Outline, path)
    }
  }
  if (outline) walk(outline, [])
  return nodes
}

function sectionNodes(outline: Outline | null): OutlineNode[] {
  return outlineNodes(outline).filter((n) => n.isSection)
}

export function bookProgress(book: Book) {
  const sections = sectionNodes(book.outline)
  const done = sections.filter((s) => book.sections[s.key]).length
  return { done, total: sections.length, ratio: sections.length ? done / sections.length : 0 }
}

export function pendingSections(book: Book): OutlineNode[] {
  return sectionNodes(book.outline).filter((s) => !book.sections[s.key])
}

// ---- Editable rows (outline review) ---------------------------------------------------------

export type OutlineLevel = 1 | 2 | 3

export interface OutlineRow {
  id: string
  level: OutlineLevel
  title: string
  description: string
}

export function outlineToRows(outline: Outline | null): OutlineRow[] {
  return outlineNodes(outline).map((node) => ({
    id: crypto.randomUUID(),
    level: Math.min(node.depth, 3) as OutlineLevel,
    title: node.title,
    description: node.description,
  }))
}

/**
 * Rebuilds an outline from rows in order. Sections attach to the chapter above, subsections to
 * the section above; blank titles are skipped and repeated titles under one parent are numbered.
 * Throws an Error with a readable message for an unusable outline.
 */
export function rowsToOutline(rows: OutlineRow[]): Outline {
  const outline: Outline = {}
  let chapter: string | null = null
  let section: string | null = null

  const add = (parent: Outline, title: string, value: string): string => {
    let unique = title
    for (let n = 2; unique in parent; n++) unique = `${title} (${n})`
    parent[unique] = value
    return unique
  }
  const asParent = (container: Outline, key: string): Outline => {
    if (typeof container[key] !== 'object') container[key] = {}
    return container[key] as Outline
  }

  for (const row of rows) {
    const title = row.title.replace(/\s+/g, ' ').trim()
    if (!title) continue
    const description = row.description.trim()
    if (row.level === 1) {
      chapter = add(outline, title, description)
      section = null
    } else if (chapter === null) {
      throw new Error(`“${title}” needs a chapter above it.`)
    } else if (row.level === 2 || section === null) {
      section = add(asParent(outline, chapter), title, description)
    } else {
      add(asParent(asParent(outline, chapter), section), title, description)
    }
  }
  if (!Object.keys(outline).length) throw new Error('The outline is empty. Add at least one chapter.')
  return outline
}

// ---- Export ---------------------------------------------------------------------------------

export function bookToMarkdown(book: Book): string {
  const parts = [`# ${book.title}\n`]
  for (const node of outlineNodes(book.outline)) {
    const text = book.sections[node.key]?.text.trim()
    if (node.isSection && !text) continue
    parts.push(`${'#'.repeat(Math.min(6, node.depth + 1))} ${node.title}\n`)
    if (text) parts.push(`${text}\n`)
  }
  return parts.join('\n')
}
