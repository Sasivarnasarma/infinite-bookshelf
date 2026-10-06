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

  it('rejects as aborted when paused just as the stream ends, so nothing half-written is saved', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', async () => sseResponse([START, DELTA], () => controller.abort()))
    const error = await write(controller.signal).catch((e: unknown) => e)
    expect(isAbort(error)).toBe(true)
  })
})
