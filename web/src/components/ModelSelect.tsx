import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { ProviderIcon } from '@/components/ProviderIcon'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays'
import { sameRef, type ModelOption } from '@/lib/settings'
import type { ModelRef } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Searchable model picker, grouped by provider. */
export function ModelSelect({
  value,
  onChange,
  options,
  className,
  id,
}: {
  value: ModelRef | null
  onChange: (ref: ModelRef) => void
  options: ModelOption[]
  className?: string
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = options.find((o) => sameRef(o, value))

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const map = new Map<string, ModelOption[]>()
    for (const o of options) {
      if (q && !o.label.toLowerCase().includes(q)) continue
      map.set(o.providerName, [...(map.get(o.providerName) ?? []), o])
    }
    return [...map.entries()]
  }, [options, query])

  return (
    <Popover open={open} onOpenChange={(o) => (setOpen(o), o || setQuery(''))}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          className={cn(
            'flex h-10 w-full min-w-0 items-center gap-2 rounded-xl border border-input bg-card/70 px-3 text-left text-sm transition-colors pointer-coarse:h-11 hover:bg-muted/50 focus-visible:border-ring',
            className,
          )}
        >
          {selected ? (
            <>
              <ProviderIcon id={selected.providerId} baseUrl={selected.baseUrl} className="text-base" />
              <span className="truncate">{selected.model}</span>
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{selected.providerName}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{value ? `${value.model} (unavailable)` : 'Choose a model'}</span>
          )}
          <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[min(18rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models…"
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground pointer-coarse:h-12 pointer-coarse:text-base"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {groups.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matching models</p>}
          {groups.map(([provider, items]) => (
            <div key={provider} className="mb-1">
              <p className="flex items-center gap-2 px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <ProviderIcon id={items[0].providerId} baseUrl={items[0].baseUrl} className="text-sm" />
                {provider}
              </p>
              {items.map((o) => (
                <button
                  key={`${o.providerId}:${o.model}`}
                  type="button"
                  onClick={() => {
                    onChange({ providerId: o.providerId, model: o.model })
                    setOpen(false)
                  }}
                  className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted', sameRef(o, value) && 'bg-accent/60')}
                >
                  <span className="truncate">{o.model}</span>
                  {sameRef(o, value) && <Check className="ml-auto size-4 text-primary" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
