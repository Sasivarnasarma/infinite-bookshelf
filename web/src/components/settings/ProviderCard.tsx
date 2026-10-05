import { ArrowUpToLine, Ellipsis, ExternalLink, Eye, EyeOff, Loader2, PenLine, Plus, RotateCcw, Trash2, X, Zap } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'

import { ProviderTile } from '@/components/ProviderIcon'
import { Button } from '@/components/ui/button'
import { Field, Input, Label, Switch } from '@/components/ui/fields'
import { Badge } from '@/components/ui/misc'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/overlays'
import { ApiRequestError, listModels } from '@/lib/api'
import { useKeys, useProviders, useServer, type KeyInfo, type ProviderInfo } from '@/lib/settings'
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
            <motion.span key={m} layout initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="inline-flex max-w-full items-center gap-1 rounded-lg border border-border bg-muted/60 py-1 pl-2.5 pr-1 font-mono text-xs">
              <span className="min-w-0 break-all">{m}</span>
              <button type="button" onClick={() => onChange(provider.models.filter((x) => x !== m))} className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground pointer-coarse:-my-1.5 pointer-coarse:p-3" aria-label={`Remove ${m}`}>
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
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} list={listId} placeholder={suggestions.length ? `Add a model (${suggestions.length} available)` : 'Add a model ID'} className="h-9 font-mono text-xs pointer-coarse:h-11 pointer-coarse:text-base" />
        <datalist id={listId}>
          {suggestions.slice(0, 500).map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <Button type="submit" variant="outline" size="sm" className="h-9 pointer-coarse:h-11" disabled={!draft.trim()}>
          <Plus /> Add
        </Button>
      </form>
    </div>
  )
}

// ---- One API key ------------------------------------------------------------------------------

type TestResult = { ok: true; models: number } | { ok: false; title: string }

/** Inline name field: Enter or leaving the field saves, Escape cancels. `onDone(null)` = cancelled. */
function KeyNameEditor({ label, onDone }: { label: string; onDone: (label: string | null) => void }) {
  const [draft, setDraft] = useState(label)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])
  const save = () => onDone(draft.trim() || label)
  return (
    <Input
      ref={input}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          save()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onDone(null)
        }
      }}
      maxLength={40}
      className="h-8 min-w-0 flex-1 font-medium pointer-coarse:h-10"
      aria-label="Key name"
    />
  )
}

function KeyRow({ provider, apiKey, primary, onTested }: { provider: ProviderInfo; apiKey: KeyInfo; primary: boolean; onTested: (models: string[]) => void }) {
  const secret = useKeys((s) => s.keys[apiKey.id] ?? '')
  const setSecret = useKeys((s) => s.setKey)
  const { updateKey, removeKey, makePrimary } = useProviders()
  const [show, setShow] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const [renaming, setRenaming] = useState(false)
  // Set when "Rename" is picked; the name field opens once the menu has closed (see onCloseAutoFocus)
  const renameNext = useRef(false)
  const several = provider.keys.length > 1

  async function test() {
    setTesting(true)
    setResult(null)
    try {
      const models = await listModels(provider.id, apiKey.id)
      onTested(models)
      setResult({ ok: true, models: models.length })
    } catch (e) {
      const err = e instanceof ApiRequestError ? e.error : null
      setResult({ ok: false, title: err?.title ?? 'Connection failed' })
      toast.error(`${apiKey.label}: ${err?.title ?? 'Connection failed'}`, { description: err ? `${err.message}${err.hint ? ` ${err.hint}` : ''}` : String(e) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <motion.li layout="position" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className={cn('grid gap-2 rounded-xl border border-border bg-card/60 p-3', !apiKey.enabled && 'opacity-60')}>
      <div className="flex items-center gap-2">
        {renaming ? (
          <KeyNameEditor
            label={apiKey.label}
            onDone={(label) => {
              if (label !== null) updateKey(apiKey.id, { label })
              setRenaming(false)
            }}
          />
        ) : (
          <p className="min-w-0 flex-1 truncate py-1 text-sm font-medium pointer-coarse:py-2 pointer-coarse:text-base" onDoubleClick={() => setRenaming(true)} title="Double-click to rename">
            {apiKey.label}
          </p>
        )}
        {several && primary && apiKey.usable && <Badge tone="primary">{provider.rotate ? 'First in turn' : 'Used first'}</Badge>}
        {result && (result.ok ? <Badge tone="success">{result.models === 1 ? '1 model' : `${result.models} models`}</Badge> : <Badge tone="danger">{result.title}</Badge>)}
        <Switch checked={apiKey.enabled} onCheckedChange={(enabled) => updateKey(apiKey.id, { enabled })} aria-label={`Use ${apiKey.label}`} />
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`${apiKey.label} options`}>
              <Ellipsis />
            </Button>
          </MenuTrigger>
          <MenuContent
            onCloseAutoFocus={(e) => {
              if (!renameNext.current) return
              // Keep focus off the menu button, or it would pull focus from the new name field
              e.preventDefault()
              renameNext.current = false
              setRenaming(true)
            }}
          >
            <MenuItem disabled={primary} onSelect={() => makePrimary(apiKey.id)}>
              <ArrowUpToLine /> Use this key first
            </MenuItem>
            <MenuItem onSelect={() => (renameNext.current = true)}>
              <PenLine /> Rename
            </MenuItem>
            <MenuItem danger onSelect={() => removeKey(apiKey.id)}>
              <Trash2 /> Remove key
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            type={show ? 'text' : 'password'}
            value={secret}
            onChange={(e) => setSecret(apiKey.id, e.target.value.trim())}
            placeholder={provider.requiresKey ? 'Paste your API key' : 'Optional: most local servers need none'}
            autoComplete="off"
            spellCheck={false}
            className="pr-10 font-mono text-xs pointer-coarse:pr-12"
            aria-label={`${apiKey.label} secret`}
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground pointer-coarse:right-1 pointer-coarse:p-3" aria-label={show ? 'Hide key' : 'Show key'}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <Button variant="outline" onClick={() => void test()} disabled={testing || (provider.requiresKey && !secret) || provider.status === 'needs-url'} aria-label={`Test ${apiKey.label}`}>
          {testing ? <Loader2 className="animate-spin" /> : <Zap />} <span className="max-[359px]:sr-only">Test</span>
        </Button>
      </div>
    </motion.li>
  )
}

// ---- How several keys are used ------------------------------------------------------------------

function KeyUsage({ provider }: { provider: ProviderInfo }) {
  const updateService = useProviders((s) => s.updateService)
  return (
    <div className="grid gap-3 rounded-xl bg-muted/50 p-3.5">
      <label className="flex cursor-pointer items-start gap-3">
        <Switch className="mt-0.5" checked={provider.failover} onCheckedChange={(failover) => updateService(provider.id, { failover })} />
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">Switch keys when one fails</span>
          <span className="text-xs leading-relaxed text-muted-foreground">If a key is rejected, runs out of quota, hits a rate limit, or can't use the model, the request is retried with the next key.</span>
        </span>
      </label>
      <label className="flex cursor-pointer items-start gap-3">
        <Switch className="mt-0.5" checked={provider.rotate} onCheckedChange={(rotate) => updateService(provider.id, { rotate })} />
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">Rotate keys</span>
          <span className="text-xs leading-relaxed text-muted-foreground">Each request uses the next key in turn, so usage is spread across your keys. Check that your provider's terms allow this for your keys.</span>
        </span>
      </label>
    </div>
  )
}

// ---- A service ----------------------------------------------------------------------------------

function statusLabel(provider: ProviderInfo) {
  const s = STATUS[provider.status]
  if (provider.status === 'ready' && provider.usableKeys > 1) return { tone: s.tone, label: `Ready · ${provider.usableKeys} keys` }
  return s
}

export function ProviderCard({ provider }: { provider: ProviderInfo }) {
  const { updateService, removeCustom, addKey } = useProviders()
  const allowPrivate = useServer((s) => s.config?.allow_private_endpoints)
  const status = statusLabel(provider)
  const open = provider.enabled
  const keyTitle = provider.requiresKey ? (provider.keys.length > 1 ? 'API keys' : 'API key') : 'API key (optional)'

  return (
    <motion.div layout="position" className={cn('surface spotlight overflow-hidden transition-shadow', open && 'ring-1 ring-primary/20')}>
      <div className="flex items-center gap-3 p-4 max-[359px]:gap-2 max-[359px]:p-3">
        <ProviderTile id={provider.id} baseUrl={provider.baseUrl} />
        <div className="min-w-0 flex-1">
          {provider.custom ? (
            <input
              value={provider.name}
              onChange={(e) => updateService(provider.id, { name: e.target.value })}
              className="w-full bg-transparent py-1 font-display text-base font-medium outline-none pointer-coarse:py-2.5"
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
          <Switch checked={provider.enabled} onCheckedChange={(enabled) => updateService(provider.id, { enabled })} aria-label={`Use ${provider.name}`} />
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="grid grid-cols-1 gap-4 border-t border-border p-4">
              {(provider.custom || provider.local) && (
                <Field label="Base URL" hint={provider.custom && !allowPrivate ? 'Must be a public https:// address on this server.' : undefined}>
                  <Input value={provider.baseUrl} onChange={(e) => updateService(provider.id, { baseUrl: e.target.value.trim() })} placeholder="https://api.example.com/v1" className="font-mono text-xs" />
                </Field>
              )}

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>{keyTitle}</Label>
                  {provider.keyUrl && (
                    <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg text-xs font-medium text-primary hover:underline pointer-coarse:-my-2 pointer-coarse:px-2 pointer-coarse:py-2.5">
                      Get a key <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
                <ul className="grid grid-cols-1 gap-2">
                  <AnimatePresence initial={false}>
                    {provider.keys.map((k, i) => (
                      <KeyRow key={k.id} provider={provider} apiKey={k} primary={i === 0} onTested={(fetchedModels) => updateService(provider.id, { fetchedModels })} />
                    ))}
                  </AnimatePresence>
                </ul>
                <Button variant="ghost" size="sm" className="w-fit" onClick={() => addKey(provider.id)}>
                  <Plus /> {provider.keys.length ? 'Add another key' : 'Add a key'}
                </Button>
              </div>

              {provider.keys.length > 1 && <KeyUsage provider={provider} />}

              <Field label="Models to offer">
                <ModelChips provider={provider} onChange={(models) => updateService(provider.id, { models })} />
              </Field>

              {!provider.custom && (
                <Button variant="ghost" size="sm" className="w-fit" onClick={() => updateService(provider.id, { models: [] })}>
                  <RotateCcw /> Default models
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
