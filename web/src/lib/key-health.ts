/**
 * What we last learned about each API key: working, rate-limited until a time, or rejected.
 * Updated by "Test" and by real requests (see runner), shown as status dots in Settings. Holds no
 * secrets: just a state per key id, kept in this browser.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface KeyHealth {
  state: 'ok' | 'limited' | 'failed'
  message: string
  at: number
  /** For 'limited': when the key is tried first again. */
  until?: number
  /** For a successful test: how many models the key can see. */
  models?: number
  /** For 'failed' / 'limited': the error code, for advice (see explainKeyError). */
  code?: string
}

interface KeyHealthState {
  byKey: Record<string, KeyHealth>
  report: (keyId: string, health: Omit<KeyHealth, 'at'>) => void
  clear: (keyId: string) => void
}

export const useKeyHealth = create<KeyHealthState>()(
  persist(
    (set) => ({
      byKey: {},
      report: (keyId, health) => set((s) => ({ byKey: { ...s.byKey, [keyId]: { ...health, at: Date.now() } } })),
      clear: (keyId) =>
        set((s) => {
          if (!(keyId in s.byKey)) return s
          const byKey = { ...s.byKey }
          delete byKey[keyId]
          return { byKey }
        }),
    }),
    { name: 'ib-key-health', version: 1 },
  ),
)

export type HealthTone = 'success' | 'warning' | 'danger' | 'neutral'

/** A key's status for display. `now` lets callers re-render a countdown. */
export function describeKey(key: { hasSecret: boolean; enabled: boolean }, health: KeyHealth | undefined, requiresKey: boolean, now: number): { tone: HealthTone; text: string } {
  if (!key.enabled) return { tone: 'neutral', text: 'Off' }
  if (!key.hasSecret) return requiresKey ? { tone: 'neutral', text: 'Paste the key' } : { tone: 'neutral', text: 'No key needed' }
  if (!health) return { tone: 'neutral', text: 'Not tested yet' }
  if (health.state === 'limited' && health.until && health.until > now) {
    const seconds = Math.ceil((health.until - now) / 1000)
    return { tone: 'warning', text: `Rate limited · back in ${seconds}s` }
  }
  if (health.state === 'failed') return { tone: 'danger', text: health.message }
  return { tone: 'success', text: health.models !== undefined ? `Working · ${health.models} ${health.models === 1 ? 'model' : 'models'}` : 'Working' }
}

/** A provider's overall status from its keys: working if any key works, else the best of the rest. */
export function combineTones(tones: HealthTone[]): HealthTone {
  for (const tone of ['success', 'warning', 'danger'] as const) if (tones.includes(tone)) return tone
  return 'neutral'
}
