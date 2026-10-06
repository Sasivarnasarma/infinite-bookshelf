import { createParser } from 'eventsource-parser'

import { apiUrl } from './api-url'
import { providerAuth, providerAuthWithSecret } from './settings'
import type { ApiError, Book, BookOptions, ModelRef, ServerConfig } from './types'

export class ApiRequestError extends Error {
  readonly error: ApiError

  constructor(error: ApiError) {
    super(error.message || error.title)
    this.error = error
  }
}

function toApiError(body: unknown, fallback: string): ApiError {
  const error = (body as { error?: ApiError })?.error
  return error ?? { code: 'unknown', title: fallback, message: fallback, hint: '' }
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if (signal?.aborted) throw e
    throw new ApiRequestError({ code: 'offline', title: "Can't reach the server", message: String(e), hint: 'Check your connection.' })
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new ApiRequestError(toApiError(data, `Request failed (${response.status})`))
  }
  return response.json() as Promise<T>
}

export async function fetchConfig(): Promise<ServerConfig> {
  const response = await fetch(apiUrl('/api/config'))
  if (!response.ok) throw new Error(`Server returned ${response.status}`)
  return response.json()
}

/** Lists a service's models with one of its keys. Also the "Test" check for that key. */
export async function listModels(serviceId: string, keyId: string | null): Promise<string[]> {
  const data = await postJson<{ models: string[] }>('/api/models', { provider: providerAuth(serviceId, keyId) })
  return data.models
}

/** Lists models with a key that isn't saved yet (the "Add provider" setup step). */
export async function listModelsWithSecret(serviceId: string, secret: string): Promise<string[]> {
  const data = await postJson<{ models: string[] }>('/api/models', { provider: providerAuthWithSecret(serviceId, secret) })
  return data.models
}

export async function exportPdf(title: string, markdown: string): Promise<Blob> {
  const response = await fetch(apiUrl('/api/export/pdf'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, markdown }),
  })
  if (!response.ok) throw new ApiRequestError(toApiError(await response.json().catch(() => null), 'PDF export failed'))
  return response.blob()
}

// ---- Streaming (Server-Sent Events over POST) -------------------------------------------------

type Handlers = Record<string, (data: any) => void> // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * POSTs `body` and dispatches each SSE event to `handlers[event]` as it arrives.
 * Resolves when the stream ends; rejects with ApiRequestError on an `error` event, or with an
 * AbortError when `signal` is aborted (Pause).
 */
async function stream(path: string, body: unknown, handlers: Handlers, signal: AbortSignal): Promise<void> {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  }).catch((e) => {
    if (signal.aborted) throw e
    throw new ApiRequestError({ code: 'offline', title: "Can't reach the server", message: String(e), hint: 'Check your connection, then press Resume.' })
  })
  if (!response.ok || !response.body) {
    throw new ApiRequestError(toApiError(await response.json().catch(() => null), `Request failed (${response.status})`))
  }

  let failure = null as ApiError | null
  let finished = false
  const parser = createParser({
    onEvent(message) {
      const data = message.data ? JSON.parse(message.data) : {}
      if (message.event === 'error') failure = data
      else if (message.event === 'done') finished = true
      else handlers[message.event ?? 'message']?.(data)
    },
  })

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      parser.feed(value)
      if (failure) break
    }
  } finally {
    reader.releaseLock()
  }
  if (failure) throw new ApiRequestError(failure)
  if (!finished) {
    // Never return normally without `done`: the caller would save a partial section as finished
    if (signal.aborted) throw signal.reason
    throw new ApiRequestError({ code: 'interrupted', title: 'Connection interrupted', message: 'The stream ended early.', hint: 'Press Resume to continue.' })
  }
}

const choice = (ref: ModelRef, keyId: string | null) => ({ provider: providerAuth(ref.providerId, keyId), model: ref.model })

function optionsBody(o: BookOptions) {
  return {
    topic: o.topic,
    instructions: o.instructions,
    style: o.style,
    complexity: o.complexity,
    seed_content: o.seedContent,
    long_outline: o.longOutline,
    section_length: o.sectionLength,
  }
}

interface OutlineHandlers {
  onStage?: (stage: 'outline' | 'title') => void
  onOutline?: (structure: Record<string, unknown>) => void
  onTitle?: (title: string) => void
  onStats?: (stats: ServerStats) => void
}

export interface ServerStats {
  input_tokens: number
  output_tokens: number
  total_time: number
}

/** `keys`: the API key to use for each step (see keyOrder in settings). */
export function streamOutline(book: Book, keys: { outline: string | null; title: string | null }, handlers: OutlineHandlers, signal: AbortSignal) {
  return stream(
    '/api/outline',
    { outline_model: choice(book.models.outline, keys.outline), title_model: choice(book.models.title, keys.title), options: optionsBody(book.options) },
    {
      stage: (d) => handlers.onStage?.(d.stage),
      outline: (d) => handlers.onOutline?.(d.structure),
      title: (d) => handlers.onTitle?.(d.title),
      stats: (d) => handlers.onStats?.(d),
    },
    signal,
  )
}

interface SectionHandlers {
  onDelta: (text: string) => void
  onStats?: (stats: ServerStats) => void
}

export function streamSection(
  book: Book,
  model: ModelRef,
  keyId: string | null,
  path: string[],
  written: { path: string[]; text: string }[],
  revision: { note: string; previous: string } | null,
  handlers: SectionHandlers,
  signal: AbortSignal,
) {
  return stream(
    '/api/sections/stream',
    {
      model: choice(model, keyId),
      options: optionsBody(book.options),
      book: { title: book.title, structure: book.outline, written },
      path,
      revision,
    },
    { delta: (d) => handlers.onDelta(d.text), stats: (d) => handlers.onStats?.(d) },
    signal,
  )
}
