import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiRequestError, streamSection } from './api'
import type { Book } from './types'
import { isAbort } from './utils'

const book = { title: 'Book', outline: { One: 'First' }, options: {}, models: {} } as unknown as Book
const model = { providerId: 'openai', model: 'm' }

/** A response streaming `events`, then running `onEnd` just before the stream closes. */
function sseResponse(events: string[], onEnd = () => {}) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(new TextEncoder().encode(event))
      onEnd()
      controller.close()
    },
  })
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
}

const START = 'event: start\ndata: {}\n\n'
const DELTA = 'event: delta\ndata: {"text":"Half a sect"}\n\n'

function write(signal: AbortSignal, onDelta: (text: string) => void = () => {}) {
  return streamSection(book, model, null, ['One'], [], null, { onDelta }, signal)
}

describe('streamSection', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the request to the configured API', async () => {
    vi.stubGlobal('window', { IB_CONFIG: { apiUrl: 'https://api.example.com' } })
    const urls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url)
      return sseResponse([START, 'event: done\ndata: {}\n\n'])
    })
    await write(new AbortController().signal)
    expect(urls).toEqual(['https://api.example.com/api/sections/stream'])
  })

  it('resolves once the stream says done', async () => {
    vi.stubGlobal('fetch', async () => sseResponse([START, DELTA, 'event: done\ndata: {}\n\n']))
    const text: string[] = []
    await write(new AbortController().signal, (t) => text.push(t))
    expect(text).toEqual(['Half a sect'])
  })

  it('fails when the stream ends early', async () => {
    vi.stubGlobal('fetch', async () => sseResponse([START, DELTA]))
    const error = await write(new AbortController().signal).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect((error as ApiRequestError).error.code).toBe('interrupted')
  })

  it('explains a connection that drops mid-stream instead of showing "network error"', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(START + DELTA))
        controller.error(new TypeError('network error'))
      },
    })
    vi.stubGlobal('fetch', async () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }))
    const error = await write(new AbortController().signal).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect((error as ApiRequestError).error).toMatchObject({ code: 'interrupted', title: 'Connection lost', detail: 'TypeError: network error' })
  })

  it('passes on the readable message and full detail of an error event', async () => {
    const event = { code: 'quota', title: 'Out of credits', message: 'You have no credits remaining.', hint: 'Add credits.', detail: 'Error code: 429 - {...}' }
    vi.stubGlobal('fetch', async () => sseResponse([START, `event: error\ndata: ${JSON.stringify(event)}\n\n`]))
    const error = await write(new AbortController().signal).catch((e: unknown) => e)
    expect((error as ApiRequestError).error).toEqual(event)
  })

  it('rejects as aborted when paused just as the stream ends, so nothing half-written is saved', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', async () => sseResponse([START, DELTA], () => controller.abort()))
    const error = await write(controller.signal).catch((e: unknown) => e)
    expect(isAbort(error)).toBe(true)
  })
})
