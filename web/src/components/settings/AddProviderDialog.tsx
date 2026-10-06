import { ArrowLeft, Check, ExternalLink, Plus, Search, Server } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { ProviderTile } from '@/components/ProviderIcon'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/fields'
import { Dialog, DialogContent } from '@/components/ui/overlays'
import { useKeyHealth } from '@/lib/key-health'
import { testSecret, type TestOutcome } from '@/lib/key-test'
import { CATALOG, TAG_LABELS, type ProviderTag } from '@/lib/provider-catalog'
import { useKeys, useProviders, useServer, type ProviderInfo } from '@/lib/settings'
import { cn } from '@/lib/utils'

import { KeyField } from './KeyField'

type Filter = 'all' | ProviderTag

// ---- Step 2: connect one provider -------------------------------------------------------------

function Setup({
  provider,
  providerNames,
  initialSecret,
  onBack,
  onConnected,
  onSwitchProvider,
}: {
  provider: ProviderInfo
  providerNames: Record<string, string>
  initialSecret: string
  onBack: () => void
  onConnected: (id: string) => void
  onSwitchProvider: (id: string, secret: string) => void
}) {
  const [secret, setSecret] = useState(initialSecret)
  const [testing, setTesting] = useState(false)
  const [outcome, setOutcome] = useState<TestOutcome | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const info = CATALOG[provider.id]

  async function test(value: string) {
    setTesting(true)
    const result = await testSecret(provider.id, value)
    setTesting(false)
    setOutcome(result)
  }

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  // A key carried over from another provider's setup is checked straight away
  useEffect(() => {
    if (initialSecret.length >= 8) void test(initialSecret)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, [])
  function onChange(value: string) {
    setSecret(value)
    setOutcome(null)
    if (timer.current) clearTimeout(timer.current)
    if (value.length >= 8) timer.current = setTimeout(() => void test(value), 700)
  }

  function connect() {
    const store = useProviders.getState()
    store.updateService(provider.id, { enabled: true, ...(outcome?.ok ? { fetchedModels: outcome.models } : {}) })
    if (secret) {
      // Fill the provider's empty key if it has one, otherwise add a key
      const own = useProviders.getState().keys.filter((k) => k.serviceId === provider.id)
      const secrets = useKeys.getState().keys
      const slot = own.find((k) => !secrets[k.id]) ?? null
      const keyId = slot?.id ?? store.addKey(provider.id)
      useKeys.getState().setKey(keyId, secret)
      // Keep what the check found, so the key's status is right straight away
      if (outcome?.ok) useKeyHealth.getState().report(keyId, { state: 'ok', message: 'Working', models: outcome.models.length })
      else if (outcome) useKeyHealth.getState().report(keyId, { state: 'failed', message: outcome.error.title })
    }
    onConnected(provider.id)
  }

  const canConnect = !provider.requiresKey || secret.length > 0

  return (
    <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="grid gap-5">
      <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={onBack}>
        <ArrowLeft /> All providers
      </Button>
      <div className="flex items-center gap-3">
        <ProviderTile id={provider.id} baseUrl={provider.baseUrl} className="size-12 text-[26px]" />
        <div className="min-w-0">
          <p className="font-display text-lg font-medium">{provider.name}</p>
          {info && <p className="text-sm text-muted-foreground">{info.blurb}</p>}
        </div>
      </div>

      {provider.requiresKey || !provider.local ? (
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="setup-key">{provider.requiresKey ? 'API key' : 'API key (optional)'}</Label>
            {provider.keyUrl && (
              <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg text-xs font-medium text-primary hover:underline pointer-coarse:-my-2 pointer-coarse:px-2 pointer-coarse:py-2.5">
                Get a key <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          <KeyField
            id="setup-key"
            autoFocus
            provider={provider}
            value={secret}
            onChange={onChange}
            check={testing ? { state: 'checking' } : outcome?.ok ? { state: 'ok', models: outcome.models.length } : outcome ? { state: 'error', error: outcome.error } : { state: 'idle' }}
            providerNames={providerNames}
            onSwitchProvider={(id) => onSwitchProvider(id, secret)}
            onEnter={() => canConnect && connect()}
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No key needed. You can change its address after connecting, if it doesn't run on this computer.</p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onBack}>
          Cancel
        </Button>
        <Button variant={outcome && !outcome.ok ? 'outline' : 'brand'} disabled={!canConnect || testing} onClick={connect}>
          <Check /> {outcome && !outcome.ok ? 'Connect anyway' : 'Connect'}
        </Button>
      </div>
    </motion.div>
  )
}

// ---- Step 1: choose a provider ----------------------------------------------------------------

function Gallery({ providers, onPick, onCustom }: { providers: ProviderInfo[]; onPick: (p: ProviderInfo) => void; onCustom: (() => void) | null }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const builtIn = providers.filter((p) => !p.custom)
  const tags = (Object.keys(TAG_LABELS) as ProviderTag[]).filter((t) => builtIn.some((p) => CATALOG[p.id]?.tags.includes(t)))

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return builtIn.filter((p) => {
      const info = CATALOG[p.id]
      if (filter !== 'all' && !info?.tags.includes(filter)) return false
      return !q || p.name.toLowerCase().includes(q) || (info?.blurb.toLowerCase().includes(q) ?? false)
    })
  }, [builtIn, query, filter])

  return (
    <div className="grid gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search providers" className="pl-9" aria-label="Search providers" />
      </div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label="Filter providers">
        {(['all', ...tags] as Filter[]).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={filter === t}
            onClick={() => setFilter(t)}
            className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors pointer-coarse:py-2.5', filter === t ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground')}
          >
            {t === 'all' ? 'All' : TAG_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((p) => (
            <motion.button
              layout
              key={p.id}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              type="button"
              onClick={() => onPick(p)}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
            >
              <ProviderTile id={p.id} baseUrl={p.baseUrl} />
              <span className="grid min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{p.name}</span>
                  {p.enabled && <Check className="size-3.5 shrink-0 text-success" aria-label="Connected" />}
                </span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{CATALOG[p.id]?.blurb ?? 'OpenAI-compatible API'}</span>
              </span>
            </motion.button>
          ))}
        </AnimatePresence>
        {onCustom && (filter === 'all' || filter === 'open') && !query && (
          <button type="button" onClick={onCustom} className="flex items-center gap-3 rounded-xl border border-dashed border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/30">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-card text-muted-foreground">
              <Server className="size-5" />
            </span>
            <span className="grid min-w-0 flex-1">
              <span className="text-sm font-medium">Custom endpoint</span>
              <span className="text-xs text-muted-foreground">Any OpenAI-compatible API</span>
            </span>
          </button>
        )}
      </div>
      {shown.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No provider matches “{query}”.</p>}
    </div>
  )
}

// ---- Dialog -----------------------------------------------------------------------------------

/**
 * Opening with `initial` (e.g. "Start with Gemini") goes straight to that provider's setup.
 * Render with a new `key` for each opening, so it starts fresh.
 */
export function AddProviderDialog({ open, onOpenChange, providers, onConnected, initial }: { open: boolean; onOpenChange: (open: boolean) => void; providers: ProviderInfo[]; onConnected: (id: string) => void; initial?: string | null }) {
  const [picked, setPicked] = useState<string | null>(initial ?? null)
  // A key pasted into one provider's setup that belongs to another moves with the switch
  const [carried, setCarried] = useState('')
  const providerNames = Object.fromEntries(providers.map((p) => [p.id, p.name]))
  const allowCustom = useServer((s) => s.config?.allow_custom_endpoints)
  const addCustom = useProviders((s) => s.addCustom)
  const provider = providers.find((p) => p.id === picked)

  const done = (id: string) => {
    onOpenChange(false)
    onConnected(id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={provider ? `Connect ${provider.name}` : 'Add a provider'} description={provider ? undefined : 'Pick a service you have, or want, an API key for.'} className="sm:w-[min(92vw,42rem)]">
        {provider ? (
          provider.enabled && provider.status !== 'needs-key' ? (
            // Already connected: nothing to set up
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">{provider.name} is already connected. Add more keys or models in its settings.</p>
              <Button className="w-fit" onClick={() => done(provider.id)}>
                Open {provider.name}
              </Button>
            </div>
          ) : (
            <Setup
              key={provider.id}
              provider={provider}
              providerNames={providerNames}
              initialSecret={carried}
              onBack={() => {
                setCarried('')
                setPicked(null)
              }}
              onConnected={done}
              onSwitchProvider={(id, secret) => {
                setCarried(secret)
                setPicked(id)
              }}
            />
          )
        ) : (
          <Gallery providers={providers} onPick={(p) => (p.enabled ? done(p.id) : setPicked(p.id))} onCustom={allowCustom ? () => done(addCustom()) : null} />
        )}
      </DialogContent>
    </Dialog>
  )
}

export function AddProviderButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <Button variant="outline" size="sm" className={className} onClick={onClick}>
      <Plus /> Add provider
    </Button>
  )
}
