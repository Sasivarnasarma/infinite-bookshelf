import { CheckCircle2, ClipboardPaste, ExternalLink, Eye, EyeOff, Loader2, Lock, TriangleAlert, XCircle } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/fields'
import { cleanKey, detectProvider, explainKeyError } from '@/lib/key-format'
import type { ApiError } from '@/lib/types'
import { cn } from '@/lib/utils'

export type KeyCheck = { state: 'idle' } | { state: 'checking' } | { state: 'ok'; models?: number } | { state: 'error'; error: Pick<ApiError, 'code' | 'message'> }

interface Props {
  id?: string
  provider: { id: string; name: string; keyUrl: string; custom: boolean; requiresKey: boolean }
  value: string
  onChange: (key: string) => void
  check: KeyCheck
  /** All provider names by id, to name a provider the key seems to belong to. */
  providerNames: Record<string, string>
  /** Offer to move the key to the provider it seems to belong to. */
  onSwitchProvider?: (providerId: string) => void
  autoFocus?: boolean
  onEnter?: () => void
  label?: string
}

// Reading the clipboard needs a secure context and isn't offered by every browser
const canPaste = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.readText) && typeof window !== 'undefined' && window.isSecureContext

/**
 * An API key input: hidden by default, tidies what's pasted, recognises keys meant for another
 * provider, and shows the result of checking the key in plain words.
 */
export function KeyField({ id, provider, value, onChange, check, providerNames, onSwitchProvider, autoFocus, onEnter, label }: Props) {
  const [show, setShow] = useState(false)
  const belongsTo = value ? detectProvider(value) : null
  const mismatch = belongsTo && belongsTo !== provider.id && providerNames[belongsTo] ? belongsTo : null

  async function paste() {
    try {
      const text = await navigator.clipboard.readText()
      if (text) onChange(cleanKey(text))
    } catch {
      /* Permission refused: typing or the keyboard's paste still works */
    }
  }

  return (
    <div className="grid gap-1.5">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Input
            id={id}
            autoFocus={autoFocus}
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(cleanKey(e.target.value))}
            onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
            placeholder={provider.requiresKey ? 'Paste your API key' : 'Optional: most local servers need none'}
            autoComplete="off"
            spellCheck={false}
            className="pr-10 font-mono text-xs pointer-coarse:pr-12"
            aria-label={label ?? `${provider.name} API key`}
            aria-invalid={check.state === 'error' || undefined}
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground pointer-coarse:right-1 pointer-coarse:p-3" aria-label={show ? 'Hide key' : 'Show key'}>
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {canPaste && !value && (
          <Button type="button" variant="outline" onClick={() => void paste()}>
            <ClipboardPaste /> <span className="max-[359px]:sr-only">Paste</span>
          </Button>
        )}
      </div>

      <div className="text-xs leading-relaxed" aria-live="polite">
        {mismatch ? (
          <p className="flex items-start gap-1.5 text-warning">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              This looks like {/^[aeiou]/i.test(providerNames[mismatch]) ? 'an' : 'a'} {providerNames[mismatch]} key, not {provider.name}.{' '}
              {onSwitchProvider && (
                <button type="button" onClick={() => onSwitchProvider(mismatch)} className="font-medium underline underline-offset-2 hover:no-underline">
                  Use it with {providerNames[mismatch]}
                </button>
              )}
            </span>
          </p>
        ) : check.state === 'checking' ? (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Checking the key…
          </p>
        ) : check.state === 'ok' ? (
          <p className="flex items-center gap-1.5 text-success">
            <CheckCircle2 className="size-3.5" /> Working{check.models !== undefined && ` · ${check.models} ${check.models === 1 ? 'model' : 'models'} found`}
          </p>
        ) : check.state === 'error' ? (
          <KeyAdviceLine error={check.error} provider={provider} />
        ) : (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Lock className="size-3.5" /> Stored only in this browser. It's checked as soon as you paste it.
          </p>
        )}
      </div>
    </div>
  )
}

/** A failed check, in plain words, with where to fix it. */
export function KeyAdviceLine({ error, provider, className }: { error: Pick<ApiError, 'code' | 'message'>; provider: Props['provider']; className?: string }) {
  const advice = explainKeyError(error, provider)
  const Icon = advice.mayStillWork ? TriangleAlert : XCircle
  return (
    <p className={cn('flex items-start gap-1.5', advice.mayStillWork ? 'text-warning' : 'text-danger', className)}>
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {advice.text}
        {advice.link && (
          <>
            {' '}
            <a href={advice.link.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2 hover:no-underline">
              {advice.link.label} <ExternalLink className="size-3" />
            </a>
          </>
        )}
      </span>
    </p>
  )
}
