/**
 * AI provider logos, from LobeHub's MIT-licensed icon set (@lobehub/icons-static-svg), bundled
 * with the app so no external requests are made. Logos are trademarks of their owners and are
 * shown only to indicate compatibility.
 */
import deepseek from '@lobehub/icons-static-svg/icons/deepseek-color.svg?raw'
import fireworks from '@lobehub/icons-static-svg/icons/fireworks-color.svg?raw'
import gemini from '@lobehub/icons-static-svg/icons/gemini-color.svg?raw'
import groq from '@lobehub/icons-static-svg/icons/groq.svg?raw'
import lmstudio from '@lobehub/icons-static-svg/icons/lmstudio.svg?raw'
import ollama from '@lobehub/icons-static-svg/icons/ollama.svg?raw'
import openai from '@lobehub/icons-static-svg/icons/openai.svg?raw'
import openrouter from '@lobehub/icons-static-svg/icons/openrouter.svg?raw'
import together from '@lobehub/icons-static-svg/icons/together-color.svg?raw'
import vllm from '@lobehub/icons-static-svg/icons/vllm-color.svg?raw'
import { Server } from 'lucide-react'

import { cn } from '@/lib/utils'

const ICONS: Record<string, string> = { gemini, openai, openrouter, deepseek, groq, ollama, lmstudio, vllm, together, fireworks }

/** Custom endpoints: recognise well-known hosts from the base URL. */
const HOST_HINTS: [RegExp, string][] = [
  [/together\.(xyz|ai)/, 'together'],
  [/fireworks\.ai/, 'fireworks'],
  [/openrouter\.ai/, 'openrouter'],
  [/openai\.com/, 'openai'],
  [/deepseek\.com/, 'deepseek'],
  [/groq\.com/, 'groq'],
  [/googleapis\.com/, 'gemini'],
  [/:11434\b/, 'ollama'],
  [/:1234\b/, 'lmstudio'],
  [/vllm|:8000\/v1/, 'vllm'],
]

function iconKey(providerId: string, baseUrl?: string): string | null {
  if (ICONS[providerId]) return providerId
  const url = (baseUrl ?? '').toLowerCase()
  return HOST_HINTS.find(([pattern]) => pattern.test(url))?.[1] ?? null
}

/** A provider's logo, sized by font-size (1em). Falls back to a generic server icon. */
export function ProviderIcon({ id, baseUrl, className }: { id: string; baseUrl?: string; className?: string }) {
  const key = iconKey(id, baseUrl)
  if (!key) return <Server className={cn('size-[1em] text-muted-foreground', className)} aria-hidden />
  // Local, trusted SVG files bundled at build time
  return <span aria-hidden className={cn('inline-flex shrink-0 [&>svg]:size-[1em]', className)} dangerouslySetInnerHTML={{ __html: ICONS[key] }} />
}

/** Logo on a neutral tile, for cards and lists. */
export function ProviderTile({ id, baseUrl, className }: { id: string; baseUrl?: string; className?: string }) {
  return (
    <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-card text-[22px] text-foreground shadow-sm', className)}>
      <ProviderIcon id={id} baseUrl={baseUrl} />
    </span>
  )
}
