import { describe, expect, it } from 'vitest'

import { combinations, recommendedFor } from './model-picks'
import { modelsInUse, setupProblems, type ModelOption, type ProviderInfo } from './settings'

const option = (model: string, tier?: ModelOption['tier'], starred = false): ModelOption =>
  ({ providerId: 'openai', providerName: 'OpenAI', model, tier, starred }) as ModelOption

const OPTIONS = [option('astra', 'best'), option('sol', 'balanced'), option('luna', 'fast'), option('custom-model')]

describe('model picks', () => {
  it('recommends models that suit each step', () => {
    expect(recommendedFor('section', OPTIONS).map((o) => o.model)).toEqual(['astra', 'sol'])
    expect(recommendedFor('title', OPTIONS).map((o) => o.model)).toEqual(['luna', 'sol'])
  })

  it('prefers starred models within a tier', () => {
    const options = [option('astra', 'best'), option('nova', 'best', true)]
    expect(recommendedFor('section', options)[0].model).toBe('nova')
  })

  it('offers one-click combinations, without duplicates', () => {
    const byId = Object.fromEntries(combinations(OPTIONS).map((c) => [c.id, c.models]))
    expect(byId.balanced).toEqual({ section: { providerId: 'openai', model: 'sol' }, outline: { providerId: 'openai', model: 'sol' }, title: { providerId: 'openai', model: 'luna' } })
    expect(byId.cheap.section.model).toBe('luna')
    // With a single model every combination is the same, so only one is offered
    expect(combinations([option('astra', 'best')])).toHaveLength(1)
  })
})

describe('setup problems', () => {
  const provider = (id: string, status: ProviderInfo['status']) => ({ id, name: id.toUpperCase(), status }) as ProviderInfo
  const ref = (providerId: string) => ({ providerId, model: 'm' })

  it('reports each provider that stops a model from running, once', () => {
    const providers = [provider('openai', 'ready'), provider('gemini', 'needs-key'), provider('groq', 'off')]
    expect(setupProblems(providers, [ref('openai')])).toEqual([])
    expect(setupProblems(providers, [ref('gemini'), ref('gemini'), ref('groq'), ref('gone')]).map((p) => [p.providerId, p.reason])).toEqual([
      ['gemini', 'needs-key'],
      ['groq', 'off'],
      ['gone', 'removed'],
    ])
  })

  it('checks the outline models until there is an outline, then the chapters model', () => {
    const models = { outline: ref('a'), title: ref('b'), section: ref('c') }
    expect(modelsInUse({ outline: null, models })).toEqual([ref('a'), ref('b')])
    expect(modelsInUse({ outline: { One: '' }, models })).toEqual([ref('c')])
  })
})
