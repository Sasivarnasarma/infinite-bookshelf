/**
 * Suggesting models: which of your models suit each step, and ready-made combinations for the
 * three steps. Uses each built-in model's tier (best / balanced / fast, from /api/config).
 */
import type { ModelOption } from './settings'
import type { ModelRef, ModelTier, Step } from './types'

export const TIER_LABELS: Record<ModelTier, string> = { best: 'Best quality', balanced: 'Balanced', fast: 'Fast, low cost' }

/** Tiers that suit each step, best fit first. */
const STEP_TIERS: Record<Step, ModelTier[]> = {
  section: ['best', 'balanced'],
  outline: ['balanced', 'best'],
  title: ['fast', 'balanced'],
}

const order = (tiers: ModelTier[]) => (o: ModelOption) => (o.tier ? tiers.indexOf(o.tier) : -1)

/** Your models that suit a step, best fit first (at most `limit`). */
export function recommendedFor(step: Step, options: ModelOption[], limit = 3): ModelOption[] {
  const tiers = STEP_TIERS[step]
  const rank = order(tiers)
  return options
    .filter((o) => rank(o) >= 0)
    .sort((a, b) => rank(a) - rank(b) || Number(b.starred) - Number(a.starred))
    .slice(0, limit)
}

export interface Combination {
  id: 'best' | 'balanced' | 'cheap'
  label: string
  models: Record<Step, ModelRef>
}

const pick = (options: ModelOption[], tiers: ModelTier[]): ModelOption | undefined => {
  for (const tier of tiers) {
    // Starred models win within a tier
    const match = options.filter((o) => o.tier === tier).sort((a, b) => Number(b.starred) - Number(a.starred))[0]
    if (match) return match
  }
  return undefined
}

const ref = (o: ModelOption): ModelRef => ({ providerId: o.providerId, model: o.model })

/**
 * One-click settings for all three steps, from the models you have. A combination is offered only
 * when every step finds a model.
 */
export function combinations(options: ModelOption[]): Combination[] {
  const plans: [Combination['id'], string, Record<Step, ModelTier[]>][] = [
    ['best', 'Best quality', { section: ['best', 'balanced'], outline: ['best', 'balanced'], title: ['balanced', 'fast', 'best'] }],
    ['balanced', 'Balanced', { section: ['balanced', 'best'], outline: ['balanced', 'fast'], title: ['fast', 'balanced'] }],
    ['cheap', 'Lowest cost', { section: ['fast', 'balanced'], outline: ['fast', 'balanced'], title: ['fast', 'balanced'] }],
  ]
  const result: Combination[] = []
  for (const [id, label, steps] of plans) {
    const section = pick(options, steps.section)
    const outline = pick(options, steps.outline)
    const title = pick(options, steps.title)
    if (section && outline && title) result.push({ id, label, models: { section: ref(section), outline: ref(outline), title: ref(title) } })
  }
  // Drop combinations that came out identical (e.g. with only one or two models)
  return result.filter((c, i) => result.findIndex((d) => JSON.stringify(d.models) === JSON.stringify(c.models)) === i)
}
