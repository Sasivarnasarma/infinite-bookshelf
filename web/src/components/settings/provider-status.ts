/** Status helpers shared by the provider list and the provider panel. */
import { useEffect, useState } from 'react'

import { combineTones, describeKey, useKeyHealth, type HealthTone, type KeyHealth } from '@/lib/key-health'
import type { ProviderInfo } from '@/lib/settings'

export const TONE_DOT: Record<HealthTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-muted-foreground/35',
}

export const TONE_TEXT: Record<HealthTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-muted-foreground',
}

/** The current time, ticking every second while `active` (for "back in 42s" countdowns). */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

/** A provider's overall status, from its keys. */
export function useProviderTone(provider: ProviderInfo, now: number): { tone: HealthTone; text: string } {
  const byKey = useKeyHealth((s) => s.byKey)
  return providerTone(provider, byKey, now)
}

/** As useProviderTone, for many providers at once (e.g. the model picker). */
export function providerTone(provider: ProviderInfo, byKey: Record<string, KeyHealth>, now: number): { tone: HealthTone; text: string } {
  if (provider.status === 'needs-key') return { tone: 'neutral', text: 'Needs a key' }
  if (provider.status === 'needs-url') return { tone: 'neutral', text: 'Needs a URL' }
  const tones = provider.keys.filter((k) => k.usable).map((k) => describeKey(k, byKey[k.id], provider.requiresKey, now).tone)
  const tone = tones.length ? combineTones(tones) : 'neutral'
  const text = { success: 'Working', warning: 'Rate limited', danger: 'Key problem', neutral: tones.length ? 'Not tested yet' : 'Ready' }[tone]
  return { tone, text }
}

export function summary(provider: ProviderInfo) {
  const keys = provider.keys.length
  const models = provider.models.length
  return [keys ? `${keys} ${keys === 1 ? 'key' : 'keys'}` : provider.requiresKey ? 'No key yet' : 'No key needed', `${models} ${models === 1 ? 'model' : 'models'}`].join(' · ')
}
