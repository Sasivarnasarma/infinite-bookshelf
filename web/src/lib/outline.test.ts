import { describe, expect, it } from 'vitest'

import { awaitingNextChapter, bookProgress, bookToMarkdown, nextChapter, outlineNodes, pendingSections, rowsToOutline, sectionKey } from './outline'
import type { Book, Outline } from './types'

const OUTLINE: Outline = {
  'Right Triangles': { Triples: 'What a triple is', Euclid: "Euclid's formula" },
  Computing: { 'In Python': 'A program' },
  Summary: 'A one-section chapter',
}

function book(written: string[][], patch: Partial<Book> = {}): Book {
  const model = { providerId: 'openai', model: 'gpt-x' }
  return {
    id: 'b1',
    title: 'Geometry',
    status: 'paused',
    options: { topic: 'Triangles', instructions: '', style: '', complexity: '', seedContent: '', longOutline: false, sectionLength: 'medium' },
    models: { outline: model, title: model, section: model },
    reviewOutline: false,
    chapterByChapter: true,
    outline: OUTLINE,
    sections: Object.fromEntries(written.map((path) => [sectionKey(path), { text: `Text of ${path.at(-1)}`, updatedAt: 1 }])),
    stats: { inputTokens: 0, outputTokens: 0, modelSeconds: 0 },
    error: null,
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  }
}

describe('outline helpers', () => {
  it('flattens the outline in reading order', () => {
    const nodes = outlineNodes(OUTLINE)
    expect(nodes.map((n) => n.title)).toEqual(['Right Triangles', 'Triples', 'Euclid', 'Computing', 'In Python', 'Summary'])
    expect(nodes.filter((n) => n.isSection).map((n) => n.title)).toEqual(['Triples', 'Euclid', 'In Python', 'Summary'])
  })

  it('counts progress and finds what is left', () => {
    const b = book([['Right Triangles', 'Triples']])
    expect(bookProgress(b)).toEqual({ done: 1, total: 4, ratio: 0.25 })
    expect(pendingSections(b).map((n) => n.title)).toEqual(['Euclid', 'In Python', 'Summary'])
  })

  it('rebuilds an outline from rows', () => {
    const outline = rowsToOutline([
      { id: '1', level: 1, title: 'One', description: '' },
      { id: '2', level: 2, title: 'A', description: 'about a' },
      { id: '3', level: 2, title: 'A', description: 'again' },
    ])
    expect(outline).toEqual({ One: { A: 'about a', 'A (2)': 'again' } })
    expect(() => rowsToOutline([{ id: '1', level: 2, title: 'Orphan', description: '' }])).toThrow(/needs a chapter/)
  })
})

describe('chapter by chapter', () => {
  it('names the next chapter and whether it has begun', () => {
    expect(nextChapter(book([]))).toEqual({ title: 'Right Triangles', number: 1, started: false })
    expect(nextChapter(book([['Right Triangles', 'Triples']]))).toEqual({ title: 'Right Triangles', number: 1, started: true })
    expect(nextChapter(book([['Right Triangles', 'Triples'], ['Right Triangles', 'Euclid']]))).toEqual({ title: 'Computing', number: 2, started: false })
    expect(nextChapter(book([['Right Triangles', 'Triples'], ['Right Triangles', 'Euclid'], ['Computing', 'In Python']]))?.title).toBe('Summary')
  })

  it('waits between chapters only', () => {
    const chapterOne = [['Right Triangles', 'Triples'], ['Right Triangles', 'Euclid']]
    expect(awaitingNextChapter(book(chapterOne))).toBe(true)
    // Not before anything is written, not mid-chapter, not when the mode is off or something failed
    expect(awaitingNextChapter(book([]))).toBe(false)
    expect(awaitingNextChapter(book([['Right Triangles', 'Triples']]))).toBe(false)
    expect(awaitingNextChapter(book(chapterOne, { chapterByChapter: false }))).toBe(false)
    expect(awaitingNextChapter(book(chapterOne, { status: 'writing' }))).toBe(false)
    expect(awaitingNextChapter(book(chapterOne, { error: { code: 'auth', title: '', message: '', hint: '' } }))).toBe(false)
  })
})

describe('Markdown export', () => {
  it('writes headings by depth, skips unwritten sections, and tidies maths', () => {
    const b = book([['Right Triangles', 'Triples']])
    b.sections[sectionKey(['Right Triangles', 'Triples'])].text = String.raw`Costs $5. Maths \(x^2\).`
    expect(bookToMarkdown(b)).toBe('# Geometry\n\n## Right Triangles\n\n### Triples\n\nCosts \\$5. Maths $x^2$.\n\n## Computing\n')
  })
})
