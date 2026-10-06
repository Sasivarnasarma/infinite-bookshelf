import { ArrowRight, Check, ChevronRight, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

import { ModelSelect } from '@/components/ModelSelect'
import { ProviderTile } from '@/components/ProviderIcon'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/fields'
import { useKeyHealth } from '@/lib/key-health'
import { combinations } from '@/lib/model-picks'
import { CATALOG, STARTERS } from '@/lib/provider-catalog'
import { modelOptions, sameRef, usePreferences, useProviderList, useServer, type ProviderInfo } from '@/lib/settings'
import type { ModelRef, Step } from '@/lib/types'
import { cn } from '@/lib/utils'

import { AddProviderButton, AddProviderDialog } from './AddProviderDialog'
import { ProviderDetail } from './ProviderDetail'
import { summary, TONE_DOT, useNow, useProviderTone } from './provider-status'

const connected = (p: ProviderInfo) => p.custom || p.enabled

function ProviderRow({ provider, selected, onSelect, now }: { provider: ProviderInfo; selected: boolean; onSelect: () => void; now: number }) {
  const status = useProviderTone(provider, now)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors',
        selected ? 'bg-muted ring-1 ring-border' : 'hover:bg-muted/60',
      )}
    >
      <ProviderTile id={provider.id} baseUrl={provider.baseUrl} className="size-9 text-[20px]" />
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-sm font-medium">{provider.name}</span>
        <span className="truncate text-xs text-muted-foreground">{summary(provider)}</span>
      </span>
      <span className={cn('size-2 shrink-0 rounded-full', TONE_DOT[status.tone])} title={status.text} aria-label={status.text} />
      <ChevronRight className="size-4 shrink-0 text-muted-foreground md:hidden" />
    </button>
  )
}

function Welcome({ providers, onStart, onBrowse }: { providers: ProviderInfo[]; onStart: (id: string) => void; onBrowse: () => void }) {
  const starters = STARTERS.map((id) => providers.find((p) => p.id === id)).filter((p): p is ProviderInfo => Boolean(p))
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="surface grid gap-5 p-6 sm:p-8">
      <div className="grid gap-1.5">
        <p className="flex items-center gap-2 font-display text-xl font-medium">
          <Sparkles className="size-5 text-primary" /> Connect your first provider
        </p>
        <p className="text-sm text-muted-foreground">Bring a key from any AI provider. It's saved only in this browser. Not sure where to start?</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {starters.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onStart(p.id)}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/30"
          >
            <ProviderTile id={p.id} baseUrl={p.baseUrl} />
            <span className="grid min-w-0 flex-1">
              <span className="text-sm font-medium">Start with {p.name}</span>
              <span className="text-xs text-muted-foreground">{CATALOG[p.id]?.blurb}</span>
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
          </button>
        ))}
      </div>
      <Button variant="outline" className="w-fit" onClick={onBrowse}>
        Browse all providers
      </Button>
    </motion.div>
  )
}

const STEPS: { step: Step; label: string; hint: string }[] = [
  { step: 'section', label: 'Chapters', hint: 'Writes every section. Pick your strongest model.' },
  { step: 'outline', label: 'Outline', hint: 'Plans the chapters. A balanced model works well.' },
  { step: 'title', label: 'Title', hint: 'One short call. A fast, low-cost model is fine.' },
]

function DefaultModels({ providers }: { providers: ProviderInfo[] }) {
  const prefs = usePreferences()
  const options = useMemo(() => modelOptions(providers), [providers])
  const presets = useMemo(() => combinations(options), [options])
  if (!options.length) return null
  const current = prefs.defaultModels
  // A combination is "on" when every step matches it (Outline and Title fall back to Chapters)
  const isOn = (models: Record<Step, ModelRef>) => (['section', 'outline', 'title'] as Step[]).every((s) => sameRef(current[s] ?? current.section, models[s]))
  return (
    <section className="grid gap-4">
      <div>
        <h2 className="font-display text-xl font-medium">Default models</h2>
        <p className="mt-1 text-sm text-muted-foreground">Preselected for every new book. You can still change them per book.</p>
      </div>
      {presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick start">
          <span className="text-xs text-muted-foreground">Quick start:</span>
          {presets.map((p) => {
            const on = isOn(p.models)
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => prefs.set({ defaultModels: p.models })}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors pointer-coarse:py-2.5',
                  on ? 'border-primary bg-accent text-accent-foreground' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {on && <Check className="size-3.5" />} {p.label}
              </button>
            )
          })}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STEPS.map(({ step, label, hint }) => (
          <Field key={step} label={label} hint={hint}>
            <ModelSelect
              step={step}
              value={current[step] ?? null}
              options={options}
              emptyLabel={step === 'section' ? undefined : 'Same as chapters'}
              onChange={(ref) => {
                const next = { ...current }
                if (ref) next[step] = ref
                else delete next[step]
                prefs.set({ defaultModels: next })
              }}
            />
          </Field>
        ))}
      </div>
    </section>
  )
}

/** Providers and keys: your connected providers, one provider's settings, and default models. */
export function ProvidersWorkspace() {
  const providers = useProviderList()
  const config = useServer((s) => s.config)
  const [params, setParams] = useSearchParams()
  const [dialog, setDialog] = useState<{ open: boolean; initial: string | null; session: number }>({ open: false, initial: null, session: 0 })
  const mine = providers.filter(connected)
  const byKey = useKeyHealth((s) => s.byKey)
  const now = useNow(mine.some((p) => p.keys.some((k) => byKey[k.id]?.state === 'limited')))

  // Selection lives in the URL (?p=), so Back on a phone returns to the list
  const requested = params.get('p')
  const selected = mine.find((p) => p.id === requested) ?? null
  const shown = selected ?? mine[0] ?? null // Desktop always shows one
  const select = (id: string | null, replace = false) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('p', id)
        else next.delete('p')
        return next
      },
      { replace },
    )
  const openDialog = (initial: string | null = null) => setDialog((d) => ({ open: true, initial, session: d.session + 1 }))

  if (!config) {
    return (
      <div className="grid gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-16 rounded-2xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-10">
      {mine.length === 0 ? (
        <Welcome providers={providers} onStart={(id) => openDialog(id)} onBrowse={() => openDialog()} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className={cn('surface grid gap-1 p-2 md:sticky md:top-24', selected && 'max-md:hidden')} aria-label="Your providers">
            <div className="flex items-center justify-between gap-2 px-2.5 pt-1.5 pb-1">
              <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Your providers</p>
            </div>
            {mine.map((p) => (
              <ProviderRow key={p.id} provider={p} selected={shown?.id === p.id} onSelect={() => select(p.id)} now={now} />
            ))}
            <AddProviderButton className="mt-1 w-full" onClick={() => openDialog()} />
          </aside>
          {shown && (
            <div className={cn(!selected && 'max-md:hidden')}>
              <ProviderDetail provider={shown} onBack={selected ? () => select(null) : undefined} onRemoved={() => select(null, true)} />
            </div>
          )}
        </div>
      )}

      <DefaultModels providers={providers} />

      {config && !config.allow_private_endpoints && (
        <p className="-mt-6 text-xs text-muted-foreground">
          Local models (Ollama, LM Studio) are available when you run Infinite Bookshelf on your own computer.
        </p>
      )}

      <AddProviderDialog
        key={dialog.session}
        open={dialog.open}
        initial={dialog.initial}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        providers={providers}
        onConnected={(id) => select(id)}
      />
    </div>
  )
}
