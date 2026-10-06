/**
 * Where the API is. By default it's this page's own server (`/api`), as with Docker and
 * `pnpm start`. A web app hosted somewhere else points at its API with, in order:
 *
 *   1. `apiUrl` in /config.js, read when the page loads (editable after deploying);
 *   2. VITE_API_URL, set when building.
 *
 * Either is an origin (`https://api.example.com`) or an origin and path
 * (`https://example.com/bookshelf`); paths like `/api/config` are added to it.
 */

declare global {
  interface Window {
    IB_CONFIG?: { apiUrl?: string }
  }
  interface ImportMetaEnv {
    readonly VITE_API_URL?: string
  }
}

/** The configured API address without a trailing slash, or '' for this page's own server. */
export function apiBase(): string {
  const configured = (typeof window === 'undefined' ? '' : window.IB_CONFIG?.apiUrl) || import.meta.env.VITE_API_URL || ''
  const raw = configured.trim()
  if (!raw) return ''
  try {
    const { protocol } = new URL(raw)
    if (protocol === 'https:' || protocol === 'http:') return raw.replace(/\/+$/, '')
  } catch {
    /* Not an absolute URL: reported below */
  }
  console.warn(`Ignoring the API address "${raw}": it must start with https:// or http://`)
  return ''
}

/** The address of an API path such as `/api/config`. */
export function apiUrl(path: string): string {
  return apiBase() + path
}
