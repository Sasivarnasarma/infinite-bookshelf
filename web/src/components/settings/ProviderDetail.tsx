import { ArrowLeft, ArrowUpToLine, Ellipsis, ExternalLink, Eye, EyeOff, KeyRound, Loader2, PenLine, Plus, RotateCcw, Star, Trash2, X, Zap } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'

import { ProviderTile } from '@/components/ProviderIcon'
import { Button } from '@/components/ui/button'
import { Field, Hint, Input, Label, Segmented, Switch } from '@/components/ui/fields'
import { Dialog, DialogClose, DialogContent, DialogTrigger, Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/overlays'
import { describeKey, useKeyHealth } from '@/lib/key-health'
import { testKey } from '@/lib/key-test'
import { useKeys, useProviders, useServer, type KeyInfo, type ProviderInfo } from '@/lib/settings'
import { cn } from '@/lib/utils'

import { summary, TONE_DOT, TONE_TEXT, useNow, useProviderTone } from './provider-status'

// ---- One key ------------------------------------------------------------------------------------

function NameEditor({ label, onDone }: { label: string; onDone: (label: string | null) => void }) {
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

function KeyRow({ provider, apiKey, first, now }: { provider: ProviderInfo; apiKey: KeyInfo; first: boolean; now: number }) {
  const secret = useKeys((s) => s.keys[apiKey.id] ?? '')
  const setSecret = useKeys((s) => s.setKey)
  const health = useKeyHealth((s) => s.byKey[apiKey.id])
  const { updateKey, removeKey, makePrimary } = useProviders()
  const [editing, setEditing] = useState(!apiKey.hasSecret)
  const [renaming, setRenaming] = useState(false)
  const [show, setShow] = useState(false)
  const [testing, setTesting] = useState(false)
  // Menu actions that move focus run after the menu has closed (see onCloseAutoFocus)
  const after = useRef<null | (() => void)>(null)
  const autoTest = useRef<ReturnType<typeof setTimeout> | null>(null)
  const status = describeKey(apiKey, health, provider.requiresKey, now)
  const several = provider.keys.length > 1
  const hint = secret ? `••••${secret.slice(-4)}` : ''

  async function test() {
    setTesting(true)
    const outcome = await testKey(provider.id, apiKey.id)
    setTesting(false)
    if (outcome.ok) setEditing(false)
    else toast.error(`${apiKey.label}: ${outcome.error.title}`, { description: [outcome.error.message, outcome.error.hint].filter(Boolean).join(' ') })
  }

  // Pasting or typing a key tests it shortly after, so there's no separate step
  useEffect(() => () => void (autoTest.current && clearTimeout(autoTest.current)), [])
  function onSecretChange(value: string) {
    setSecret(apiKey.id, value)
    if (autoTest.current) clearTimeout(autoTest.current)
    if (value.length >= 8 && provider.status !== 'needs-url') autoTest.current = setTimeout(() => void test(), 900)
  }

  return (
    <motion.li layout="position" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className={cn('grid gap-2 px-3.5 py-3', !apiKey.enabled && 'opacity-60')}>
      <div className="flex items-center gap-2.5">
        <span className={cn('size-2 shrink-0 rounded-full', TONE_DOT[status.tone], status.tone === 'warning' && 'animate-pulse')} aria-hidden />
        {renaming ? (
          <NameEditor
            label={apiKey.label}
            onDone={(label) => {
              if (label !== null) updateKey(apiKey.id, { label })
              setRenaming(false)
            }}
          />
        ) : (
          <div className="grid min-w-0 flex-1" onDoubleClick={() => setRenaming(true)}>
            <p className="truncate text-sm font-medium pointer-coarse:text-base">
              {apiKey.label}
              {hint && <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{hint}</span>}
            </p>
            <p className={cn('truncate text-xs', TONE_TEXT[status.tone])}>
              {testing ? 'Testing…' : status.text}
              {several && first && apiKey.usable && <span className="text-muted-foreground"> · {provider.rotate ? 'first in turn' : 'used first'}</span>}
            </p>
          </div>
        )}
        <Switch checked={apiKey.enabled} onCheckedChange={(enabled) => updateKey(apiKey.id, { enabled })} aria-label={`Use ${apiKey.label}`} />
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`${apiKey.label} options`}>
              <Ellipsis />
            </Button>
          </MenuTrigger>
          <MenuContent
            onCloseAutoFocus={(e) => {
              if (!after.current) return
              e.preventDefault() // Keep focus off the menu button: the action focuses a field
              after.current()
              after.current = null
            }}
          >
            <MenuItem disabled={first} onSelect={() => makePrimary(apiKey.id)}>
              <ArrowUpToLine /> Use this key first
            </MenuItem>
            <MenuItem onSelect={() => (after.current = () => setRenaming(true))}>
              <PenLine /> Rename
            </MenuItem>
            <MenuItem onSelect={() => (after.current = () => setEditing(true))}>
              <KeyRound /> Change key
            </MenuItem>
            <MenuItem disabled={!apiKey.hasSecret && provider.requiresKey} onSelect={() => void test()}>
              <Zap /> Test now
            </MenuItem>
            <MenuItem danger onSelect={() => removeKey(apiKey.id)}>
              <Trash2 /> Remove key
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      {editing && (
        <div className="flex gap-2 pl-[1.125rem]">
          <div className="relative min-w-0 flex-1">
            <Input
              autoFocus={apiKey.hasSecret}
              type={show ? 'text' : 'password'}
              value={secret}
              onChange={(e) => onSecretChange(e.target.value.trim())}
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
      )}
    </motion.li>
  )
}

// ---- When a key fails -----------------------------------------------------------------------------

type Policy = 'next' | 'rotate' | 'stop'

const POLICY_HINTS: Record<Policy, string> = {
  next: 'If a key is rejected, runs out of quota, hits a rate limit, or can’t use the model, the request is retried with your next key.',
  rotate: 'Each request uses the next key in turn, spreading usage across your keys, and still moves on if one fails. Check that your provider’s terms allow this.',
  stop: 'Only the first key is used. If it fails, writing pauses with the error.',
}

function FailurePolicy({ provider }: { provider: ProviderInfo }) {
  const updateService = useProviders((s) => s.updateService)
  const policy: Policy = !provider.failover ? 'stop' : provider.rotate ? 'rotate' : 'next'
  const set = (next: Policy) => updateService(provider.id, { failover: next !== 'stop', rotate: next === 'rotate' })
  return (
    <div className="grid gap-2">
      <Label>When a key fails</Label>
      <Segmented<Policy>
        value={policy}
        onChange={set}
        className="w-full sm:w-fit"
        options={[
          { value: 'next', label: 'Next key' },
          { value: 'rotate', label: 'Rotate' },
          { value: 'stop', label: 'Stop' },
        ]}
      />
      <Hint>{POLICY_HINTS[policy]}</Hint>
    </div>
  )
}

// ---- Models ---------------------------------------------------------------------------------------

function Models({ provider }: { provider: ProviderInfo }) {
  const { updateService, toggleStar } = useProviders()
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const listId = useId()
  const suggestions = provider.fetchedModels.filter((m) => !provider.models.includes(m))
  const ordered = [...provider.models].sort((a, b) => Number(provider.starred.includes(b)) - Number(provider.starred.includes(a)))
  const loader = provider.keys.find((k) => k.usable) ?? (!provider.requiresKey ? provider.keys[0] : undefined)

  const add = (model: string) => {
    const m = model.trim()
    if (m && !provider.models.includes(m)) updateService(provider.id, { models: [...provider.models, m] })
    setDraft('')
  }

  async function load() {
    if (!loader) return
    setLoading(true)
    const outcome = await testKey(provider.id, loader.id)
    setLoading(false)
    if (outcome.ok) toast.success(`${outcome.models.length} models available`, { description: 'Type to add any of them.' })
    else toast.error(outcome.error.title, { description: outcome.error.message })
  }

  return (
    <div className="grid gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <Label>Models</Label>
        <span className="text-xs text-muted-foreground">Starred models come first when you pick one</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <AnimatePresence initial={false}>
          {ordered.map((m) => {
            const starred = provider.starred.includes(m)
            return (
              <motion.span key={m} layout initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} className={cn('inline-flex max-w-full items-center rounded-lg border py-0.5 pl-0.5 pr-1 font-mono text-xs', starred ? 'border-primary/40 bg-accent' : 'border-border bg-muted/60')}>
                <button type="button" onClick={() => toggleStar(provider.id, m)} className="shrink-0 rounded p-1 text-muted-foreground hover:text-primary pointer-coarse:p-3" aria-label={starred ? `Unstar ${m}` : `Star ${m}`} aria-pressed={starred}>
                  <Star className={cn('size-3.5', starred && 'fill-primary text-primary')} />
                </button>
                <span className="min-w-0 break-all py-0.5">{m}</span>
                <button type="button" onClick={() => updateService(provider.id, { models: provider.models.filter((x) => x !== m) })} className="ml-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground pointer-coarse:p-3" aria-label={`Remove ${m}`}>
                  <X className="size-3" />
                </button>
              </motion.span>
            )
          })}
        </AnimatePresence>
        {provider.models.length === 0 && <span className="text-xs text-muted-foreground">No models yet. Load the list, or type a model ID.</span>}
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add(draft)
        }}
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} list={listId} placeholder={suggestions.length ? `Add a model (${suggestions.length} available)` : 'Add a model ID'} className="h-9 min-w-40 flex-1 font-mono text-xs pointer-coarse:h-11" aria-label="Model ID" />
        <datalist id={listId}>
          {suggestions.slice(0, 500).map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <Button type="submit" variant="outline" size="sm" className="h-9 pointer-coarse:h-11" disabled={!draft.trim()}>
          <Plus /> Add
        </Button>
      </form>
      <div className="flex flex-wrap gap-1">
        <Button variant="ghost" size="sm" onClick={() => void load()} disabled={!loader || loading}>
          {loading ? <Loader2 className="animate-spin" /> : <Zap />} Load model list
        </Button>
        {!provider.custom && (
          <Button variant="ghost" size="sm" onClick={() => updateService(provider.id, { models: [] })}>
            <RotateCcw /> Reset to defaults
          </Button>
        )}
      </div>
    </div>
  )
}

// ---- The panel ------------------------------------------------------------------------------------

function RemoveProvider({ provider, onRemoved }: { provider: ProviderInfo; onRemoved: () => void }) {
  const { updateService, removeCustom } = useProviders()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-danger">
          <Trash2 /> Remove
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Remove ${provider.name}?`}
        description={provider.custom ? 'This endpoint and its keys are deleted from this browser.' : 'It disappears from the model picker. Its keys stay saved here, so adding it again is instant.'}
      >
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button
              variant="danger"
              onClick={() => {
                if (provider.custom) removeCustom(provider.id)
                else updateService(provider.id, { enabled: false })
                onRemoved()
              }}
            >
              <Trash2 /> Remove
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ProviderDetail({ provider, onBack, onRemoved }: { provider: ProviderInfo; onBack?: () => void; onRemoved: () => void }) {
  const { updateService, addKey } = useProviders()
  const allowPrivate = useServer((s) => s.config?.allow_private_endpoints)
  const byKey = useKeyHealth((s) => s.byKey)
  const limited = provider.keys.some((k) => byKey[k.id]?.state === 'limited')
  const now = useNow(limited)
  const overall = useProviderTone(provider, now)
  const [testingAll, setTestingAll] = useState(false)
  const testable = provider.keys.filter((k) => k.usable || (!provider.requiresKey && k.enabled))

  async function testAll() {
    setTestingAll(true)
    const results = []
    for (const k of testable) results.push(await testKey(provider.id, k.id))
    setTestingAll(false)
    const working = results.filter((r) => r.ok).length
    if (working === results.length) toast.success(`All ${working} ${working === 1 ? 'key works' : 'keys work'}`)
    else toast.warning(`${working} of ${results.length} keys work`, { description: 'See each key for details.' })
  }

  return (
    <motion.div key={provider.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }} className="surface grid grid-cols-1 gap-6 p-4 sm:p-6">
      {onBack && (
        <Button variant="ghost" size="sm" className="-ml-2 -mt-1 w-fit md:hidden" onClick={onBack}>
          <ArrowLeft /> Your providers
        </Button>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <ProviderTile id={provider.id} baseUrl={provider.baseUrl} className="size-12 text-[26px]" />
        <div className="min-w-0 flex-1 basis-40">
          {provider.custom ? (
            <input
              value={provider.name}
              onChange={(e) => updateService(provider.id, { name: e.target.value })}
              className="w-full bg-transparent py-0.5 font-display text-xl font-medium outline-none"
              aria-label="Endpoint name"
            />
          ) : (
            <h2 className="font-display text-xl font-medium">{provider.name}</h2>
          )}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn('size-1.5 rounded-full', TONE_DOT[overall.tone])} aria-hidden />
            <span className={TONE_TEXT[overall.tone]}>{overall.text}</span> · {summary(provider)}
          </p>
        </div>
        {/* Phones: the actions get their own row under the name */}
        <div className="flex shrink-0 flex-wrap justify-end gap-1 max-sm:w-full max-sm:justify-start">
          {testable.length > 0 && provider.status === 'ready' && (
            <Button variant="outline" size="sm" onClick={() => void testAll()} disabled={testingAll}>
              {testingAll ? <Loader2 className="animate-spin" /> : <Zap />} {testable.length > 1 ? 'Test all' : 'Test'}
            </Button>
          )}
          <RemoveProvider provider={provider} onRemoved={onRemoved} />
        </div>
      </div>

      {(provider.custom || provider.local) && (
        <Field label="Base URL" hint={provider.custom && !allowPrivate ? 'Must be a public https:// address on this server.' : undefined}>
          <Input value={provider.baseUrl} onChange={(e) => updateService(provider.id, { baseUrl: e.target.value.trim() })} placeholder="https://api.example.com/v1" className="font-mono text-xs" />
        </Field>
      )}

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <Label>{provider.requiresKey ? (provider.keys.length > 1 ? 'API keys' : 'API key') : 'API key (optional)'}</Label>
          {provider.keyUrl && (
            <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg text-xs font-medium text-primary hover:underline pointer-coarse:-my-2 pointer-coarse:px-2 pointer-coarse:py-2.5">
              Get a key <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        <ul className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card/60">
          <AnimatePresence initial={false}>
            {provider.keys.map((k, i) => (
              <KeyRow key={k.id} provider={provider} apiKey={k} first={i === 0} now={now} />
            ))}
          </AnimatePresence>
          <li>
            <button type="button" onClick={() => addKey(provider.id)} className="flex w-full items-center gap-2 px-3.5 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
              <Plus className="size-4" /> {provider.keys.length ? 'Add another key' : 'Add a key'}
            </button>
          </li>
        </ul>
      </div>

      {provider.keys.length > 1 && <FailurePolicy provider={provider} />}

      <Models provider={provider} />
    </motion.div>
  )
}
