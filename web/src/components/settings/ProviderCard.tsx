import { CheckCircle2, ExternalLink, Eye, EyeOff, Loader2, Plus, RotateCcw, Trash2, X, Zap } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useId, useState } from 'react'
import { toast } from 'sonner'

import { ProviderTile } from '@/components/ProviderIcon'
import { Button } from '@/components/ui/button'
import { Field, Input, Switch } from '@/components/ui/fields'
import { Badge } from '@/components/ui/misc'
import { ApiRequestError, listModels } from '@/lib/api'
import { useKeys, useProviders, useServer, type ProviderInfo } from '@/lib/settings'
import { cn } from '@/lib/utils'

const STATUS = {
  ready: { tone: 'success', label: 'Ready' },
  'needs-key': { tone: 'warning', label: 'Needs a key' },
  'needs-url': { tone: 'warning', label: 'Needs a URL' },
  off: { tone: 'neutral', label: 'Off' },
} as const

function ModelChips({ provider, onChange }: { provider: ProviderInfo; onChange: (models: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const listId = useId()
  const add = (model: string) => {
    const m = model.trim()
    if (m && !provider.models.includes(m)) onChange([...provider.models, m])
    setDraft('')
  }
  const suggestions = provider.fetchedModels.filter((m) => !provider.models.includes(m))
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        <AnimatePresence initial={false}>
          {provider.models.map((m) => (
            <motion.span key={m} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/60 py-1 pl-2.5 pr-1 font-mono text-xs">
              {m}
              <button type="button" onClick={() => onChange(provider.models.filter((x) => x !== m))} className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground" aria-label={`Remove ${m}`}>
                <X className="size-3" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        {provider.models.length === 0 && <span className="text-xs text-muted-foreground">No models yet. Test the connection to load the list, or type a model ID.</span>}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add(draft)
        }}
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} list={listId} placeholder={suggestions.length ? `Add a model (${suggestions.length} available)` : 'Add a model ID'} className="h-9 font-mono text-xs" />
        <datalist id={listId}>
          {suggestions.slice(0, 500).map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <Button type="submit" variant="outline" size="sm" className="h-9" disabled={!draft.trim()}>
          <Plus /> Add
        </Button>
      </form>
    </div>
  )
}

export function ProviderCard({ provider }: { provider: ProviderInfo }) {
  const key = useKeys((s) => s.keys[provider.id] ?? '')
  const setKey = useKeys((s) => s.setKey)
  const { updatePreset, updateCustom, removeCustom } = useProviders()
  const allowPrivate = useServer((s) => s.config?.allow_private_endpoints)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [tested, setTested] = useState<number | null>(null)
  const status = STATUS[provider.status]

  const update = (patch: { enabled?: boolean; models?: string[]; fetchedModels?: string[]; baseUrl?: string; name?: string }) => {
    if (provider.custom) {
      const { enabled: _ignored, ...rest } = patch
      void _ignored
      updateCustom(provider.id, rest)
    } else updatePreset(provider.id, patch)
  }

  async function test() {
    setTesting(true)
    setTested(null)
    try {
      const models = await listModels(provider.id)
      update({ fetchedModels: models })
      setTested(models.length)
      toast.success(`${provider.name} is connected`, { description: `${models.length} models available.` })
    } catch (e) {
      const err = e instanceof ApiRequestError ? e.error : null
      toast.error(err?.title ?? 'Connection failed', { description: err ? `${err.message}${err.hint ? ` ${err.hint}` : ''}` : String(e) })
    } finally {
      setTesting(false)
    }
  }

  const open = provider.enabled

  return (
    <motion.div layout="position" className={cn('surface spotlight overflow-hidden transition-shadow', open && 'ring-1 ring-primary/20')}>
      <div className="flex items-center gap-3 p-4">
        <ProviderTile id={provider.id} baseUrl={provider.baseUrl} />
        <div className="min-w-0 flex-1">
          {provider.custom ? (
            <input
              value={provider.name}
              onChange={(e) => update({ name: e.target.value })}
              className="w-full bg-transparent font-display text-base font-medium outline-none"
              aria-label="Endpoint name"
            />
          ) : (
            <p className="font-display text-base font-medium">{provider.name}</p>
          )}
          <p className="truncate font-mono text-[11px] text-muted-foreground">{provider.baseUrl || 'No URL yet'}</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
        {provider.custom ? (
          <Button variant="ghost" size="icon-sm" onClick={() => removeCustom(provider.id)} aria-label="Remove endpoint">
            <Trash2 />
          </Button>
        ) : (
          <Switch checked={provider.enabled} onCheckedChange={(enabled) => update({ enabled })} aria-label={`Use ${provider.name}`} />
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="grid gap-4 border-t border-border p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label={provider.requiresKey ? 'API key' : 'API key (optional)'}
                  hint={
                    provider.keyUrl ? (
                      <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                        Get a key <ExternalLink className="size-3" />
                      </a>
                    ) : undefined
                  }
                >
                  <div className="relative">
                    <Input
                      type={showKey ? 'text' : 'password'}
                      value={key}
                      onChange={(e) => setKey(provider.id, e.target.value.trim())}
                      placeholder={provider.requiresKey ? 'Paste your API key' : 'Not needed for most local servers'}
                      autoComplete="off"
                      spellCheck={false}
                      className="pr-10 font-mono text-xs"
                    />
                    <button type="button" onClick={() => setShowKey((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground" aria-label={showKey ? 'Hide key' : 'Show key'}>
                      {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </Field>
                {(provider.custom || provider.local) && (
                  <Field label="Base URL" hint={provider.custom && !allowPrivate ? 'Must be a public https:// address on this server.' : undefined}>
                    <Input value={provider.baseUrl} onChange={(e) => update({ baseUrl: e.target.value.trim() })} placeholder="https://api.example.com/v1" className="font-mono text-xs" />
                  </Field>
                )}
              </div>

              <Field label="Models to offer">
                <ModelChips provider={provider} onChange={(models) => update({ models })} />
              </Field>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => void test()} disabled={testing || provider.status !== 'ready'}>
                  {testing ? <Loader2 className="animate-spin" /> : <Zap />} Test connection
                </Button>
                {tested !== null && (
                  <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                    <CheckCircle2 className="size-4" /> Connected · {tested} models found
                  </motion.span>
                )}
                {!provider.custom && (
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() => update({ models: [] })}>
                    <RotateCcw /> Default models
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
