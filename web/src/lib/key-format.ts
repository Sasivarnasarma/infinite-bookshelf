/**
 * Help with API keys as people paste them: tidy what was copied, recognise whose key it is, and
 * explain failed checks with a next step.
 */
import type { ApiError } from './types'

/**
 * Removes what often comes along with a copied key: spaces and line breaks, surrounding quotes,
 * an `Authorization: Bearer ` prefix, or a `.env` line like `OPENAI_API_KEY="..."`.
 */
export function cleanKey(raw: string): string {
  let key = raw.trim()
  key = key.replace(/^export\s+/i, '')
  key = key.replace(/^[A-Z][A-Z0-9_]*\s*[=:]\s*/, '') // NAME=value or NAME: value
  key = key.replace(/^authorization\s*:\s*/i, '').replace(/^bearer\s+/i, '')
  key = key.replace(/^["'`]+|["'`;,]+$/g, '')
  return key.replace(/\s+/g, '')
}

/**
 * Key prefixes that belong to exactly one provider. Plain `sk-` is shared by several (OpenAI,
 * DeepSeek, Kimi, Qwen), so it isn't used to guess.
 */
const PREFIXES: [string, string][] = [
  ['sk-ant-', 'anthropic'],
  ['sk-or-', 'openrouter'],
  ['sk-proj-', 'openai'],
  ['AIza', 'gemini'],
  ['gsk_', 'groq'],
  ['xai-', 'xai'],
]

/** The provider a key clearly belongs to, if its format gives it away. */
export function detectProvider(key: string): string | null {
  return PREFIXES.find(([prefix]) => key.startsWith(prefix))?.[1] ?? null
}

export interface KeyAdvice {
  text: string
  /** Where to fix it, e.g. the provider's key page. */
  link?: { label: string; href: string }
  /** The key might still work for writing even though the check failed. */
  mayStillWork?: boolean
}

/** A failed key check, in plain words with a next step. */
export function explainKeyError(error: Pick<ApiError, 'code' | 'message'>, provider: { name: string; keyUrl: string; custom?: boolean }): KeyAdvice {
  const keyPage = provider.keyUrl ? { label: `Open ${provider.name} keys`, href: provider.keyUrl } : undefined
  switch (error.code) {
    case 'auth':
      return { text: 'This key was rejected. Check you copied all of it, or create a new one.', link: keyPage }
    case 'rate_limit':
      return { text: 'This key is out of quota or rate-limited right now. Check your plan or billing, or try again later.', link: keyPage, mayStillWork: true }
    case 'connection':
    case 'offline':
      return { text: provider.custom ? `Couldn't reach ${provider.name}. Check the base URL and your connection.` : `Couldn't reach ${provider.name}. Check your connection and try again.` }
    case 'endpoint_not_allowed':
      return { text: error.message || 'This server doesn’t allow that address.' }
    case 'rate_limited':
      return { text: 'This app’s server is busy. Try again in a minute.', mayStillWork: true }
    default:
      // Some providers don't support listing models, so the check fails even with a good key
      return { text: `${provider.name} didn't list its models. The key may still work: try writing a book with it.`, mayStillWork: true }
  }
}
