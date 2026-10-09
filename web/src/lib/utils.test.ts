import { afterEach, describe, expect, it, vi } from 'vitest'

import { bookWords, cleanTitle, liveStatus, MAX_TITLE_CHARS, newId, readingTime } from './utils'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('newId', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns a v4 UUID', () => {
    expect(newId()).toMatch(UUID_V4)
  })

  it('still works where crypto.randomUUID is missing (plain-HTTP pages)', () => {
    // A plain-HTTP page: getRandomValues exists, randomUUID doesn't
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
    const ids = new Set(Array.from({ length: 200 }, () => newId()))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id).toMatch(UUID_V4)
  })
})

describe('reading time', () => {
  it('counts the words of finished sections', () => {
    expect(bookWords({ sections: { a: { text: 'one two  three' }, b: { text: '\nfour\n' } } })).toBe(4)
  })

  it('reads at about 230 words a minute', () => {
    expect(readingTime(10)).toBe('1 min read')
    expect(readingTime(2300)).toBe('10 min read')
    expect(readingTime(13_800)).toBe('1 h read')
    expect(readingTime(18_400)).toBe('1 h 20 min read')
  })
})

describe('live status', () => {
  it('says what is holding a section up until the first words arrive', () => {
    expect(liveStatus(false, false, true)).toBe('Waiting for the model')
    expect(liveStatus(false, true, true)).toBe('Thinking')
    expect(liveStatus(false, false, false)).toBe('Waiting for the model')
  })

  it('says writing or rewriting once text is streaming', () => {
    expect(liveStatus(true, true, true)).toBe('Rewriting')
    expect(liveStatus(true, false, false)).toBe('Writing')
  })
})

describe('cleanTitle', () => {
  it('keeps a title to one line with single spaces', () => {
    expect(cleanTitle('  From Click to Content:\n  The Hidden   Journey ')).toBe('From Click to Content: The Hidden Journey')
  })

  it('is empty for blank input, so the old title is kept', () => {
    expect(cleanTitle(' \n\t ')).toBe('')
  })

  it('caps the length', () => {
    expect(cleanTitle('a'.repeat(500))).toHaveLength(MAX_TITLE_CHARS)
  })
})
