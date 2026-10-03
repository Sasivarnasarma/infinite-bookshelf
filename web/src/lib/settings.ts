/**
 * User settings, all kept in this browser:
 *   - preferences (theme, reading size, defaults)  → localStorage "ib-preferences"
 *   - providers (enabled, models, custom endpoints) → localStorage "ib-providers"
 *   - API keys                                      → localStorage "ib-keys", or sessionStorage when
 *                                                     "Remember my keys" is off (gone when the tab closes)
 * Keys leave the browser only inside requests to this app's own API, which never stores them.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { ModelRef, ProviderPreset, SectionLength, ServerConfig, Step } from './types'

// ---- Preferences ------------------------------------------------------------------------------

export type Theme = 'system' | 'light' | 'dark'
export type ReadingSize = 'sm' | 'md' | 'lg'

interface PreferencesState {
  theme: Theme
  readingSize: ReadingSize
  rememberKeys: boolean
  defaultModels: Partial<Record<Step, ModelRef>>
  sectionLength: SectionLength
  reviewOutline: boolean
  delaySeconds: number
  set: (patch: Partial<Omit<PreferencesState, 'set'>>) => void
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'system',
      readingSize: 'md',
      rememberKeys: true,
      defaultModels: {},
      sectionLength: 'medium',
      reviewOutline: true,
      delaySeconds: 0.5,
      set: (patch) => set(patch),
    }),
    { name: 'ib-preferences', version: 1 },
  ),
)

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

// ---- Providers ------------------------------------------------------------------------------

export interface ProviderSettings {
  enabled: boolean
  /** Models offered in pickers; empty means the preset's list. */
  models: string[]
  fetchedModels: string[]
  /** Only for local presets (e.g. Ollama on another machine). */
  baseUrl?: string
}

export interface CustomEndpoint {
  id: string
  name: string
  baseUrl: string
  models: string[]
  fetchedModels: string[]
}

interface ProvidersState {
  presets: Record<string, ProviderSettings>
  customs: CustomEndpoint[]
  updatePreset: (id: string, patch: Partial<ProviderSettings>) => void
  addCustom: () => string
  updateCustom: (id: string, patch: Partial<CustomEndpoint>) => void
  removeCustom: (id: string) => void
}

const emptyPreset: ProviderSettings = { enabled: false, models: [], fetchedModels: [] }

export const useProviders = create<ProvidersState>()(
  persist(
    (set) => ({
      presets: {},
      customs: [],
      updatePreset: (id, patch) =>
        set((s) => ({ presets: { ...s.presets, [id]: { ...emptyPreset, ...s.presets[id], ...patch } } })),
      addCustom: () => {
        const id = `custom-${crypto.randomUUID().slice(0, 8)}`
        set((s) => ({ customs: [...s.customs, { id, name: 'Custom endpoint', baseUrl: '', models: [], fetchedModels: [] }] }))
        return id
      },
      updateCustom: (id, patch) => set((s) => ({ customs: s.customs.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      removeCustom: (id) => set((s) => ({ customs: s.customs.filter((c) => c.id !== id) })),
    }),
    { name: 'ib-providers', version: 1 },
  ),
)

// ---- API keys ---------------------------------------------------------------------------------

const KEYS_STORAGE = 'ib-keys'

function readKeys(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEYS_STORAGE) ?? sessionStorage.getItem(KEYS_STORAGE) ?? '{}')
  } catch {
    return {}
  }
}

interface KeysState {
  keys: Record<string, string>
  setKey: (providerId: string, key: string) => void
  clear: () => void
}

export const useKeys = create<KeysState>()((set) => ({
  keys: readKeys(),
  setKey: (providerId, key) => set((s) => ({ keys: { ...s.keys, [providerId]: key } })),
  clear: () => set({ keys: {} }),
}))

function writeKeys(keys: Record<string, string>, remember: boolean) {
  try {
    const json = JSON.stringify(keys)
    if (remember) {
      localStorage.setItem(KEYS_STORAGE, json)
      sessionStorage.removeItem(KEYS_STORAGE)
    } else {
      sessionStorage.setItem(KEYS_STORAGE, json)
      localStorage.removeItem(KEYS_STORAGE)
    }
  } catch {
    /* Storage unavailable (private mode): keys stay in memory for this page */
  }
}

useKeys.subscribe((s) => writeKeys(s.keys, usePreferences.getState().rememberKeys))
usePreferences.subscribe((s, prev) => {
  if (s.rememberKeys !== prev.rememberKeys) writeKeys(useKeys.getState().keys, s.rememberKeys)
})

// ---- Server config ----------------------------------------------------------------------------

interface ServerState {
  config: ServerConfig | null
  error: string | null
  setConfig: (config: ServerConfig) => void
  setError: (error: string) => void
}

export const useServer = create<ServerState>()((set) => ({
  config: null,
  error: null,
  setConfig: (config) => set({ config, error: null }),
  setError: (error) => set({ error }),
}))

// ---- Derived: available providers and models --------------------------------------------------

export interface ProviderInfo {
  id: string
  name: string
  custom: boolean
  local: boolean
  enabled: boolean
  requiresKey: boolean
  hasKey: boolean
  baseUrl: string
  keyUrl: string
  models: string[]
  fetchedModels: string[]
  defaultModel: string
  status: 'ready' | 'needs-key' | 'needs-url' | 'off'
}

export function listProviders(
  config: ServerConfig | null,
  presets: Record<string, ProviderSettings>,
  customs: CustomEndpoint[],
  keys: Record<string, string>,
): ProviderInfo[] {
  if (!config) return []
  const fromPreset = (p: ProviderPreset): ProviderInfo => {
    const s = { ...emptyPreset, ...presets[p.id] }
    const hasKey = Boolean(keys[p.id]?.trim())
    const status = !s.enabled ? 'off' : p.requires_key && !hasKey ? 'needs-key' : 'ready'
    return {
      id: p.id,
      name: p.name,
      custom: false,
      local: p.local,
      enabled: s.enabled,
      requiresKey: p.requires_key,
      hasKey,
      baseUrl: s.baseUrl || p.base_url,
      keyUrl: p.key_url,
      models: s.models.length ? s.models : p.models,
      fetchedModels: s.fetchedModels,
      defaultModel: p.default_model,
      status,
    }
  }
  const fromCustom = (c: CustomEndpoint): ProviderInfo => ({
    id: c.id,
    name: c.name || 'Custom endpoint',
    custom: true,
    local: false,
    enabled: true,
    requiresKey: false,
    hasKey: Boolean(keys[c.id]?.trim()),
    baseUrl: c.baseUrl,
    keyUrl: '',
    models: c.models,
    fetchedModels: c.fetchedModels,
    defaultModel: c.models[0] ?? '',
    status: c.baseUrl.trim() ? 'ready' : 'needs-url',
  })
  const customAllowed = config.allow_custom_endpoints
  return [...config.providers.map(fromPreset), ...(customAllowed ? customs.map(fromCustom) : [])]
}

export function useProviderList(): ProviderInfo[] {
  const config = useServer((s) => s.config)
  const presets = useProviders((s) => s.presets)
  const customs = useProviders((s) => s.customs)
  const keys = useKeys((s) => s.keys)
  return listProviders(config, presets, customs, keys)
}

export interface ModelOption extends ModelRef {
  label: string
  providerName: string
  baseUrl: string
}

export function modelOptions(providers: ProviderInfo[]): ModelOption[] {
  return providers
    .filter((p) => p.status === 'ready')
    .flatMap((p) => p.models.map((model) => ({ providerId: p.id, model, providerName: p.name, baseUrl: p.baseUrl, label: `${p.name} · ${model}` })))
}

export function sameRef(a?: ModelRef | null, b?: ModelRef | null): boolean {
  return Boolean(a && b && a.providerId === b.providerId && a.model === b.model)
}

/** The request body describing how to reach a provider (with the user's key). */
export function providerAuth(providerId: string): Record<string, string> {
  const key = useKeys.getState().keys[providerId] ?? ''
  const custom = useProviders.getState().customs.find((c) => c.id === providerId)
  if (custom) return { base_url: custom.baseUrl, api_key: key }
  const preset = useProviders.getState().presets[providerId]
  return { preset: providerId, api_key: key, ...(preset?.baseUrl ? { base_url: preset.baseUrl } : {}) }
}
