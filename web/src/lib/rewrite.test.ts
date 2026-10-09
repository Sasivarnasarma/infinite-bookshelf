import { describe, expect, it } from 'vitest'

import { MAX_RECENT_NOTES, REWRITE_PRESETS, rememberNote, rewriteNote, undone, withPrevious } from './rewrite'
import type { SectionState } from './types'

const instruction = (id: string) => REWRITE_PRESETS.find((p) => p.id === id)!.instruction

describe('rewrite notes', () => {
  it("joins the chosen presets' instructions and the reader's own words", () => {
    expect(rewriteNote(['shorter', 'example'], '  Use AWS CLI v2. ')).toBe(`${instruction('shorter')} ${instruction('example')} Use AWS CLI v2.`)
  })

  it('works with only presets, or only text', () => {
    expect(rewriteNote(['code'], '')).toBe(instruction('code'))
    expect(rewriteNote([], 'Fix the diagram')).toBe('Fix the diagram')
    expect(rewriteNote([], '  ')).toBe('')
  })

  it('remembers recent notes, newest first, without repeats', () => {
    let recent: string[] = []
    for (const note of ['a', 'b', 'a', '  ', 'c']) recent = rememberNote(recent, note)
    expect(recent).toEqual(['c', 'a', 'b'])
    for (let i = 0; i < 10; i++) recent = rememberNote(recent, `n${i}`)
    expect(recent).toHaveLength(MAX_RECENT_NOTES)
  })
})

describe('undoing a rewrite', () => {
  const first: SectionState = { text: 'First.', updatedAt: 1, summary: 'One.' }
  const second: SectionState = { text: 'Second.', updatedAt: 2 }

  it('keeps one version back', () => {
    const once = withPrevious(second, first)
    expect(once.previous).toEqual(first)
    const twice = withPrevious({ text: 'Third.', updatedAt: 3 }, once)
    expect(twice.previous).toEqual(second) // Not a chain: only the last step can be undone
    expect(twice.previous).not.toHaveProperty('previous')
  })

  it('puts the previous version back', () => {
    expect(undone(withPrevious(second, first))).toMatchObject({ text: 'First.', summary: 'One.' })
    expect(undone(first)).toBeNull()
    expect(undone(undefined)).toBeNull()
  })
})
