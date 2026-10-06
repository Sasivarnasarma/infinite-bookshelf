import { describe, expect, it } from 'vitest'

import { cleanKey, detectProvider, explainKeyError } from './key-format'

describe('cleanKey', () => {
  it.each([
    ['  sk-proj-abc123 \n', 'sk-proj-abc123'],
    ['Authorization: Bearer sk-or-v1-abc', 'sk-or-v1-abc'],
    ['OPENAI_API_KEY="sk-proj-abc"', 'sk-proj-abc'],
    ["export GEMINI_API_KEY='AIzaXYZ';", 'AIzaXYZ'],
    ['sk-ant-\nabc', 'sk-ant-abc'],
  ])('%j → %s', (raw, key) => expect(cleanKey(raw)).toBe(key))
})

describe('detectProvider', () => {
  it('recognises prefixes unique to one provider', () => {
    expect(detectProvider('sk-ant-x')).toBe('anthropic')
    expect(detectProvider('sk-or-v1-x')).toBe('openrouter')
    expect(detectProvider('sk-proj-x')).toBe('openai')
    expect(detectProvider('AIzaX')).toBe('gemini')
    expect(detectProvider('gsk_x')).toBe('groq')
    expect(detectProvider('xai-x')).toBe('xai')
  })

  it("doesn't guess from a plain sk- key", () => {
    expect(detectProvider('sk-abc')).toBeNull()
  })
})

describe('explainKeyError', () => {
  const openai = { name: 'OpenAI', keyUrl: 'https://platform.openai.com/api-keys' }

  it('points a rejected key at the key page', () => {
    const advice = explainKeyError({ code: 'auth', message: '' }, openai)
    expect(advice.text).toMatch(/rejected/)
    expect(advice.link?.href).toBe(openai.keyUrl)
    expect(advice.mayStillWork).toBeUndefined()
  })

  it('says an unlisted model list may still work', () => {
    expect(explainKeyError({ code: 'generation_error', message: '' }, openai).mayStillWork).toBe(true)
  })
})
