import { Check, ChevronsUpDown, CornerDownLeft, Search, Star, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import { ProviderIcon } from '@/components/ProviderIcon'
import { providerTone, useNow } from '@/components/settings/provider-status'
import { Dialog, DialogContent, Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays'
import { useKeyHealth } from '@/lib/key-health'
import { recommendedFor, TIER_LABELS } from '@/lib/model-picks'
import { sameRef, usePreferences, useProviderList, useProviders, type ModelOption } from '@/lib/settings'
import type { ModelRef, Step } from '@/lib/types'
import { cn } from '@/lib/utils'

const STEP_NAMES: Record<Step, string> = { section: 'chapters', outline: 'the outline', title: 'the title' }

/** Phones get a bottom sheet instead of a popover. */
const phoneQuery = '(max-width: 639px)'
function useIsPhone() {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(phoneQuery)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => matchMedia(phoneQuery).matches,
    () => false,
  )
}

type Row = { index: number } & ({ kind: 'empty'; key: string } | { kind: 'model'; key: string; option: ModelOption; showProvider: boolean })
type Group = { title: string; icon?: React.ReactNode; rows: Row[]; providerId?: string }

function useGroups(options: ModelOption[], query: string, step: Step | undefined, emptyLabel: string | undefined): Group[] {
  const recent = usePreferences((s) => s.recentModels)
  return useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (o: ModelOption) => !q || o.label.toLowerCase().includes(q)
    // Rows are numbered in display order, for keyboard navigation
    let next = 0
    const row = (group: string, option: ModelOption, showProvider: boolean): Row => ({ index: next++, kind: 'model', key: `${group}:${option.providerId}:${option.model}`, option, showProvider })
    const groups: Group[] = []
    if (emptyLabel && !q) groups.push({ title: '', rows: [{ index: next++, kind: 'empty', key: 'empty' }] })
    if (!q && step) {
      const picks = recommendedFor(step, options)
      if (picks.length) groups.push({ title: `Recommended for ${STEP_NAMES[step]}`, rows: picks.map((o) => row('rec', o, true)) })
    }
    const starred = options.filter((o) => o.starred && matches(o))
    if (starred.length) groups.push({ title: 'Starred', icon: <Star className="size-3.5 fill-primary text-primary" />, rows: starred.map((o) => row('star', o, true)) })
    if (!q) {
      const used = (recent ?? []).map((r) => options.find((o) => sameRef(o, r))).filter((o): o is ModelOption => Boolean(o))
      if (used.length) groups.push({ title: 'Recently used', rows: used.map((o) => row('recent', o, true)) })
    }
    const byProvider = new Map<string, ModelOption[]>()
    for (const o of options) if (matches(o)) byProvider.set(o.providerName, [...(byProvider.get(o.providerName) ?? []), o])
    for (const [name, items] of byProvider) {
      groups.push({ title: name, providerId: items[0].providerId, icon: <ProviderIcon id={items[0].providerId} baseUrl={items[0].baseUrl} className="text-sm" />, rows: items.map((o) => row(name, o, false)) })
    }
    return groups
  }, [options, query, step, emptyLabel, recent])
}

/** The searchable list, shared by the popover (desktop) and the sheet (phones). */
function Picker({ value, options, step, emptyLabel, onPick, autoFocus }: { value: ModelRef | null; options: ModelOption[]; step?: Step; emptyLabel?: string; onPick: (ref: ModelRef | null) => void; autoFocus: boolean }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const groups = useGroups(options, query, step, emptyLabel)
  const rows = groups.flatMap((g) => g.rows)
  const toggleStar = useProviders((s) => s.toggleStar)
  const providers = useProviderList()
  const byKey = useKeyHealth((s) => s.byKey)
  const now = useNow(false)
  const tones = useMemo(() => Object.fromEntries(providers.map((p) => [p.id, providerTone(p, byKey, now)])), [providers, byKey, now])

  // Keep the highlighted row in view while moving with the keyboard
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (row: Row | undefined) => {
    if (!row) return
    onPick(row.kind === 'empty' ? null : { providerId: row.option.providerId, model: row.option.model })
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const last = rows.length - 1
    if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, last))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0))
    else if (e.key === 'Home') setActive(0)
    else if (e.key === 'End') setActive(last)
    else if (e.key === 'Enter') choose(rows[active])
    else return
    e.preventDefault()
  }

  return (
    <div className="grid" onKeyDown={onKeyDown}>
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          placeholder={`Search ${options.length} models`}
          aria-label="Search models"
          role="combobox"
          aria-expanded="true"
          aria-controls="model-picker-list"
          aria-activedescendant={rows[active] ? `model-row-${active}` : undefined}
          className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground pointer-coarse:h-12 pointer-coarse:text-base"
        />
      </div>
      <div ref={list} id="model-picker-list" role="listbox" className="max-h-[min(22rem,60dvh)] overflow-y-auto p-1.5">
        {rows.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matching models</p>}
        {groups.map((group) => (
          <div key={group.title || 'top'} role="group" aria-label={group.title || undefined} className="mb-1">
            {group.title && (
              <p className="flex items-center gap-2 px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.icon}
                {group.title}
                {group.providerId && tones[group.providerId] && (tones[group.providerId].tone === 'warning' || tones[group.providerId].tone === 'danger') && (
                  <span className={cn('ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] normal-case tracking-normal', tones[group.providerId].tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-warning/15 text-warning')}>
                    <TriangleAlert className="size-3" /> {tones[group.providerId].text}
                  </span>
                )}
              </p>
            )}
            {group.rows.map((row) => {
              const i = row.index
              const isActive = i === active
              if (row.kind === 'empty') {
                return (
                  <div key={row.key} id={`model-row-${i}`} data-index={i} role="option" aria-selected={!value} onMouseMove={() => setActive(i)} onClick={() => choose(row)} className={cn('flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm pointer-coarse:py-3', isActive && 'bg-muted')}>
                    <span className="text-muted-foreground">{emptyLabel}</span>
                    {!value && <Check className="ml-auto size-4 text-primary" />}
                  </div>
                )
              }
              const o = row.option
              const selected = sameRef(o, value)
              const tone = tones[o.providerId]
              const warn = row.showProvider && tone && (tone.tone === 'warning' || tone.tone === 'danger')
              return (
                <div
                  key={row.key}
                  id={`model-row-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(row)}
                  className={cn('group/row flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm pointer-coarse:py-2.5', isActive && 'bg-muted', selected && 'bg-accent/60', tone?.tone === 'danger' && 'opacity-55')}
                >
                  {row.showProvider && <ProviderIcon id={o.providerId} baseUrl={o.baseUrl} className="text-base" />}
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate">{o.model}</span>
                    {(row.showProvider || o.tier) && (
                      <span className="truncate text-xs text-muted-foreground">
                        {[row.showProvider && o.providerName, o.tier && TIER_LABELS[o.tier]].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  {warn && (
                    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', tone.tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-warning/15 text-warning')}>
                      <TriangleAlert className="size-3" /> {tone.text}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleStar(o.providerId, o.model)
                    }}
                    className={cn('shrink-0 rounded p-1 text-muted-foreground transition-opacity hover:text-primary pointer-coarse:p-2.5', !o.starred && 'pointer-fine:opacity-0 pointer-fine:group-hover/row:opacity-100', isActive && 'opacity-100')}
                    aria-label={o.starred ? `Unstar ${o.model}` : `Star ${o.model}`}
                    aria-pressed={o.starred}
                    tabIndex={-1}
                  >
                    <Star className={cn('size-3.5', o.starred && 'fill-primary text-primary')} />
                  </button>
                  {selected && <Check className="size-4 shrink-0 text-primary" />}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="hidden items-center gap-3 border-t border-border px-3 py-2 text-[11px] text-muted-foreground pointer-fine:flex">
        <span>↑ ↓ to move</span>
        <span className="inline-flex items-center gap-1">
          <CornerDownLeft className="size-3" /> to choose
        </span>
        <span className="ml-auto">★ to star a model</span>
      </div>
    </div>
  )
}

/**
 * Searchable model picker. Groups: recommended for the step, starred, recently used, then by
 * provider. With `emptyLabel`, "nothing chosen" is an option too (e.g. "Same as chapters").
 */
export function ModelSelect({
  value,
  onChange,
  options,
  className,
  id,
  step,
  emptyLabel,
  disabled,
}: {
  value: ModelRef | null
  onChange: (ref: ModelRef | null) => void
  options: ModelOption[]
  className?: string
  id?: string
  step?: Step
  emptyLabel?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const phone = useIsPhone()
  const selected = options.find((o) => sameRef(o, value))
  const pick = (ref: ModelRef | null) => {
    onChange(ref)
    setOpen(false)
  }

  const trigger = (
    <button
      id={id}
      type="button"
      disabled={disabled}
      onClick={phone ? () => setOpen(true) : undefined}
      aria-haspopup="listbox"
      className={cn('flex h-10 w-full min-w-0 items-center gap-2 rounded-xl border border-input bg-card/70 px-3 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:border-ring disabled:pointer-events-none disabled:opacity-55 pointer-coarse:h-11', className)}
    >
      {selected ? (
        <>
          <ProviderIcon id={selected.providerId} baseUrl={selected.baseUrl} className="text-base" />
          <span className="truncate">{selected.model}</span>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{selected.providerName}</span>
        </>
      ) : (
        <span className="truncate text-muted-foreground">{value ? `${value.model} (unavailable)` : (emptyLabel ?? 'Choose a model')}</span>
      )}
      <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
    </button>
  )

  const picker = <Picker value={value} options={options} step={step} emptyLabel={emptyLabel} onPick={pick} autoFocus={!phone} />

  if (phone) {
    return (
      <>
        {trigger}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            title="Choose a model"
            className="gap-2 p-0 pt-5 [&>div:first-child]:px-5"
            // Focus the sheet, not the search box: on phones that would open the keyboard over the list
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              ;(e.currentTarget as HTMLElement | null)?.focus()
            }}
          >
            {open && picker}
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-[max(var(--radix-popover-trigger-width),22rem)] max-w-[calc(100vw-1.5rem)] p-0">{open && picker}</PopoverContent>
    </Popover>
  )
}
