/**
 * User settings, all kept in this browser:
 *   - preferences (theme, reading size, defaults)  → localStorage "ib-preferences"
 *   - services (enabled, models, custom endpoints)
 *     and their labelled keys                       → localStorage "ib-services"
 *   - API key secrets                               → localStorage "ib-api-keys", or sessionStorage when
 *                                                     "Remember my keys" is off (gone when the tab closes)
 * Keys leave the browser only inside requests to this app's own API, which never stores them.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type { ModelRef, ModelTier, ProviderPreset, SectionLength, ServerConfig, Step } from './types'
import { useKeyHealth } from './key-health'
import { newId } from './utils'

// ---- Preferences ------------------------------------------------------------------------------

export type Theme = 'system' | 'light' | 'dark'
export type ReadingSize = 'sm' | 'md' | 'lg'

interface PreferencesState {
  theme: Theme
  readingSize: ReadingSize
  rememberKeys: boolean
  defaultModels: Partial<Record<Step, ModelRef>>
  /** Models used for recent books, newest first: offered first in pickers. */
  recentModels: ModelRef[]
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
      recentModels: [],
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

// ---- Services and their API keys -------------------------------------------------------------
//
// A service is a built-in provider (OpenAI, Gemini, ...) or a custom OpenAI-compatible endpoint.
// It owns the models offered in pickers. Each service can hold several API keys: requests use
// the first enabled key, or take turns when "rotate" is on, and move on to the next key when one
// fails (rate limit, quota, bad key) if "failover" is on. Books store only service + model; the
// key is picked per request.

export interface ServiceSettings {
  enabled: boolean
  /** Models offered in pickers; empty means the preset's list. */
  models: string[]
  fetchedModels: string[]
  /** Only for local presets (e.g. Ollama on another machine). */
  baseUrl?: string
  rotate: boolean
  failover: boolean
  /** Favourite models: listed first in model pickers. */
  starred: string[]
}

export interface CustomEndpoint {
  id: string
  name: string
  baseUrl: string
  models: string[]
  fetchedModels: string[]
  rotate: boolean
  failover: boolean
  starred: string[]
}

/** A labelled API key for a service. The secret itself lives in useKeys, by key id. */
export interface ApiKeyEntry {
  id: string
  serviceId: string
  label: string
  enabled: boolean
}

/** Settings for a built-in service, or a custom endpoint (which also has a name and no on/off). */
type ServicePatch = Partial<ServiceSettings> & { name?: string }

interface ProvidersState {
  presets: Record<string, ServiceSettings>
  customs: CustomEndpoint[]
  keys: ApiKeyEntry[]
  updateService: (id: string, patch: ServicePatch) => void
  addCustom: () => string
  removeCustom: (id: string) => void
  addKey: (serviceId: string) => string
  updateKey: (id: string, patch: Partial<Pick<ApiKeyEntry, 'label' | 'enabled'>>) => void
  removeKey: (id: string) => void
  /** Moves a key to the front of its service's list, making it the one tried first. */
  makePrimary: (id: string) => void
  toggleStar: (serviceId: string, model: string) => void
}

const emptyService: ServiceSettings = { enabled: false, models: [], fetchedModels: [], rotate: false, failover: true, starred: [] }

/** "Key 2" for a service's second key, and so on (skipping a name already taken). */
function nextKeyLabel(keys: ApiKeyEntry[], serviceId: string) {
  const own = keys.filter((k) => k.serviceId === serviceId)
  const used = new Set(own.map((k) => k.label))
  let n = own.length + 1
  while (used.has(`Key ${n}`)) n++
  return `Key ${n}`
}

export const useProviders = create<ProvidersState>()(
  persist(
    (set, get) => ({
      presets: {},
      customs: [],
      keys: [],
      updateService: (id, patch) =>
        set((s) => {
          if (s.customs.some((c) => c.id === id)) {
            const { enabled: _enabled, ...rest } = patch
            void _enabled
            return { customs: s.customs.map((c) => (c.id === id ? { ...c, ...rest } : c)) }
          }
          const presets = { ...s.presets, [id]: { ...emptyService, ...s.presets[id], ...patch } }
          // Switching a service on for the first time gives it an empty key to fill in
          const needsKey = patch.enabled && !s.keys.some((k) => k.serviceId === id)
          const keys = needsKey ? [...s.keys, { id: `key-${newId()}`, serviceId: id, label: 'Key 1', enabled: true }] : s.keys
          return { presets, keys }
        }),
      addCustom: () => {
        const id = `custom-${newId().slice(0, 8)}`
        set((s) => ({
          customs: [...s.customs, { id, name: 'Custom endpoint', baseUrl: '', models: [], fetchedModels: [], rotate: false, failover: true, starred: [] }],
          keys: [...s.keys, { id: `key-${newId()}`, serviceId: id, label: 'Key 1', enabled: true }],
        }))
        return id
      },
      removeCustom: (id) =>
        set((s) => ({ customs: s.customs.filter((c) => c.id !== id), keys: s.keys.filter((k) => k.serviceId !== id) })),
      addKey: (serviceId) => {
        const id = `key-${newId()}`
        set((s) => ({ keys: [...s.keys, { id, serviceId, label: nextKeyLabel(s.keys, serviceId), enabled: true }] }))
        return id
      },
      updateKey: (id, patch) => set((s) => ({ keys: s.keys.map((k) => (k.id === id ? { ...k, ...patch } : k)) })),
      removeKey: (id) => {
        set((s) => ({ keys: s.keys.filter((k) => k.id !== id) }))
        useKeys.getState().setKey(id, '')
        useKeyHealth.getState().clear(id)
      },
      toggleStar: (serviceId, model) => {
        const custom = get().customs.find((c) => c.id === serviceId)
        const starred = (custom ?? { ...emptyService, ...get().presets[serviceId] }).starred ?? []
        const next = starred.includes(model) ? starred.filter((m) => m !== model) : [...starred, model]
        get().updateService(serviceId, { starred: next })
      },
      makePrimary: (id) => {
        const key = get().keys.find((k) => k.id === id)
        if (!key) return
        set((s) => ({ keys: [key, ...s.keys.filter((k) => k.id !== id)] }))
      },
    }),
    { name: 'ib-services', version: 1 },
  ),
)

// ---- Secrets ----------------------------------------------------------------------------------

const KEYS_STORAGE = 'ib-api-keys'

function readKeys(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEYS_STORAGE) ?? sessionStorage.getItem(KEYS_STORAGE) ?? '{}')
  } catch {
    return {}
  }
}

interface KeysState {
  /** Secret per key id (ApiKeyEntry.id). */
  keys: Record<string, string>
  setKey: (keyId: string, secret: string) => void
  clear: () => void
}

export const useKeys = create<KeysState>()((set) => ({
  keys: readKeys(),
  setKey: (keyId, secret) =>
    set((s) => {
      if ((s.keys[keyId] ?? '') !== secret) useKeyHealth.getState().clear(keyId)
      const keys = { ...s.keys, [keyId]: secret }
      if (!secret) delete keys[keyId]
      return { keys }
    }),
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

// ---- Derived: services, their keys, and the models on offer ------------------------------------

export interface KeyInfo extends ApiKeyEntry {
  hasSecret: boolean
  /** Enabled and filled in: requests may use it. */
  usable: boolean
}

export interface ProviderInfo {
  id: string
  name: string
  custom: boolean
  local: boolean
  enabled: boolean
  requiresKey: boolean
  keys: KeyInfo[]
  usableKeys: number
  rotate: boolean
  failover: boolean
  starred: string[]
  tiers: Record<string, ModelTier>
  baseUrl: string
  keyUrl: string
  models: string[]
  fetchedModels: string[]
  defaultModel: string
  status: 'ready' | 'needs-key' | 'needs-url' | 'off'
}

export function listProviders(
  config: ServerConfig | null,
  presets: Record<string, ServiceSettings>,
  customs: CustomEndpoint[],
  entries: ApiKeyEntry[],
  secrets: Record<string, string>,
): ProviderInfo[] {
  if (!config) return []
  const keysOf = (serviceId: string): KeyInfo[] =>
    entries
      .filter((k) => k.serviceId === serviceId)
      .map((k) => {
        const hasSecret = Boolean(secrets[k.id]?.trim())
        return { ...k, hasSecret, usable: k.enabled && hasSecret }
      })

  const fromPreset = (p: ProviderPreset): ProviderInfo => {
    const s = { ...emptyService, ...presets[p.id] }
    const keys = keysOf(p.id)
    const usableKeys = keys.filter((k) => k.usable).length
    const status = !s.enabled ? 'off' : p.requires_key && !usableKeys ? 'needs-key' : 'ready'
    return {
      id: p.id,
      name: p.name,
      custom: false,
      local: p.local,
      enabled: s.enabled,
      requiresKey: p.requires_key,
      keys,
      usableKeys,
      rotate: s.rotate,
      failover: s.failover,
      starred: s.starred ?? [],
      tiers: p.tiers ?? {},
      baseUrl: s.baseUrl || p.base_url,
      keyUrl: p.key_url,
      models: s.models.length ? s.models : p.models,
      fetchedModels: s.fetchedModels,
      defaultModel: p.default_model,
      status,
    }
  }
  const fromCustom = (c: CustomEndpoint): ProviderInfo => {
    const keys = keysOf(c.id)
    return {
      id: c.id,
      name: c.name || 'Custom endpoint',
      custom: true,
      local: false,
      enabled: true,
      requiresKey: false,
      keys,
      usableKeys: keys.filter((k) => k.usable).length,
      rotate: c.rotate,
      failover: c.failover,
      starred: c.starred ?? [],
      tiers: {},
      baseUrl: c.baseUrl,
      keyUrl: '',
      models: c.models,
      fetchedModels: c.fetchedModels,
      defaultModel: c.models[0] ?? '',
      status: c.baseUrl.trim() ? 'ready' : 'needs-url',
    }
  }
  const customAllowed = config.allow_custom_endpoints
  return [...config.providers.map(fromPreset), ...(customAllowed ? customs.map(fromCustom) : [])]
}

export function useProviderList(): ProviderInfo[] {
  const config = useServer((s) => s.config)
  const presets = useProviders((s) => s.presets)
  const customs = useProviders((s) => s.customs)
  const entries = useProviders((s) => s.keys)
  const secrets = useKeys((s) => s.keys)
  return listProviders(config, presets, customs, entries, secrets)
}

/** The current settings, outside React (for the writing loop). */
function currentProviders(): ProviderInfo[] {
  const { presets, customs, keys } = useProviders.getState()
  return listProviders(useServer.getState().config, presets, customs, keys, useKeys.getState().keys)
}

export interface ModelOption extends ModelRef {
  label: string
  providerName: string
  baseUrl: string
  starred: boolean
  tier?: ModelTier
}

export function modelOptions(providers: ProviderInfo[]): ModelOption[] {
  return providers
    .filter((p) => p.status === 'ready')
    .flatMap((p) => p.models.map((model) => ({ providerId: p.id, model, providerName: p.name, baseUrl: p.baseUrl, label: `${p.name} · ${model}`, starred: p.starred.includes(model), tier: p.tiers[model] })))
}

export function sameRef(a?: ModelRef | null, b?: ModelRef | null): boolean {
  return Boolean(a && b && a.providerId === b.providerId && a.model === b.model)
}

const RECENT_LIMIT = 6

/** Puts these models at the front of the recently used list. */
export function rememberModels(refs: ModelRef[]) {
  const prefs = usePreferences.getState()
  const recent = [...refs, ...(prefs.recentModels ?? [])].filter((ref, i, all) => all.findIndex((r) => sameRef(r, ref)) === i)
  prefs.set({ recentModels: recent.slice(0, RECENT_LIMIT) })
}

// ---- Choosing a key for each request ------------------------------------------------------------

/** One way to call a service: a specific key, or none (servers that don't need one). */
export interface KeyChoice {
  keyId: string | null
  label: string
}

const rotation = new Map<string, number>()

/** Error codes where another key may succeed: a rejected key, an exhausted quota or rate limit, or a model this key can't use. */
export const KEY_FAILOVER_CODES = new Set(['auth', 'rate_limit', 'model_unavailable'])

/**
 * Keys that just failed are set aside (tried last) for a while, so every request doesn't start
 * with a key that's known to fail: a rate limit for a minute, a rejected key until its secret
 * changes, an unavailable model for that model. Kept in memory: a reload starts fresh.
 */
const RATE_LIMIT_PAUSE_MS = 60_000
const setAside = new Map<string, { until: number; secret: string }>()

const slotOf = (keyId: string, model: string | null) => (model === null ? keyId : `${keyId}\u0000${model}`)

export function noteKeyFailure(ref: ModelRef, keyId: string | null, code: string) {
  if (!keyId) return
  const secret = useKeys.getState().keys[keyId] ?? ''
  const health = useKeyHealth.getState()
  if (code === 'rate_limit') {
    const until = Date.now() + RATE_LIMIT_PAUSE_MS
    setAside.set(slotOf(keyId, null), { until, secret })
    health.report(keyId, { state: 'limited', message: 'Rate limit or quota reached', until, code })
  } else if (code === 'auth') {
    setAside.set(slotOf(keyId, null), { until: Infinity, secret })
    health.report(keyId, { state: 'failed', message: 'Key rejected', code })
  } else if (code === 'model_unavailable') setAside.set(slotOf(keyId, ref.model), { until: Infinity, secret })
}

/** A request with this key worked. */
export function noteKeySuccess(keyId: string | null) {
  if (!keyId) return
  const health = useKeyHealth.getState()
  const previous = health.byKey[keyId]
  if (previous?.state !== 'ok') health.report(keyId, { state: 'ok', message: 'Working', models: previous?.models })
}

function isSetAside(keyId: string, model: string): boolean {
  const secret = useKeys.getState().keys[keyId] ?? ''
  return [slotOf(keyId, null), slotOf(keyId, model)].some((slot) => {
    const entry = setAside.get(slot)
    if (!entry) return false
    // Expired, or the key was edited since it failed: give it another chance
    if (entry.until <= Date.now() || entry.secret !== secret) {
      setAside.delete(slot)
      return false
    }
    return true
  })
}

/**
 * The keys to try for one request, in order: the first is used, the rest are fallbacks if
 * failover is on. With rotate on, each request starts one key further along (per service and
 * model), so requests take turns. Keys that just failed go to the back of the line.
 */
export function keyOrder(ref: ModelRef): KeyChoice[] {
  const provider = currentProviders().find((p) => p.id === ref.providerId)
  if (!provider) return [{ keyId: null, label: '' }]
  const usable = provider.keys.filter((k) => k.usable).map((k) => ({ keyId: k.id, label: k.label }))
  if (!usable.length) return [{ keyId: null, label: '' }] // No key: fine for local or keyless servers
  let order = usable
  if (provider.rotate && usable.length > 1) {
    const slot = `${ref.providerId}\u0000${ref.model}`
    const start = (rotation.get(slot) ?? 0) % usable.length
    rotation.set(slot, start + 1)
    order = [...usable.slice(start), ...usable.slice(0, start)]
  }
  if (!provider.failover) return order.slice(0, 1)
  const benched = (k: KeyChoice) => (k.keyId ? isSetAside(k.keyId, ref.model) : false)
  return [...order.filter((k) => !benched(k)), ...order.filter(benched)]
}

/** The request body describing how to reach a service, with the chosen key. */
export function providerAuth(serviceId: string, keyId: string | null): Record<string, string> {
  return providerAuthWithSecret(serviceId, keyId ? (useKeys.getState().keys[keyId] ?? '') : '')
}

/** As providerAuth, with a secret that isn't saved yet (testing a key before adding it). */
export function providerAuthWithSecret(serviceId: string, secret: string): Record<string, string> {
  const custom = useProviders.getState().customs.find((c) => c.id === serviceId)
  if (custom) return { base_url: custom.baseUrl, api_key: secret }
  const preset = useProviders.getState().presets[serviceId]
  return { preset: serviceId, api_key: secret, ...(preset?.baseUrl ? { base_url: preset.baseUrl } : {}) }
}
