/**
 * The writing loop, against a fake API and an in-memory book store: section order, saving,
 * summaries as context, pause and resume, key failover, chapter-by-chapter, rewrites, and
 * recovery after a reload.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiError, Book, ModelRef } from './types'

// ---- Fakes ------------------------------------------------------------------------------------

const store = vi.hoisted(() => new Map<string, unknown>())

vi.mock('./db', () => {
  const copy = <T>(value: T): T => structuredClone(value)
  const books = {
    get: async (id: string) => (store.has(id) ? copy(store.get(id)) : undefined),
    where: () => ({
      anyOf: (...statuses: string[]) => ({
        toArray: async () => [...store.values()].filter((b) => statuses.flat().includes((b as Book).status)).map(copy),
      }),
    }),
  }
  return {
    db: { books },
    updateBook: async (id: string, patch: Partial<Book> | ((book: Book) => Partial<Book>)) => {
      const book = store.get(id) as Book | undefined
      if (!book) return
      const changes = typeof patch === 'function' ? patch(copy(book)) : patch
      store.set(id, { ...book, ...copy(changes), updatedAt: Date.now() })
    },
  }
})

vi.mock('./api', async (actual) => ({
  ...(await actual<typeof import('./api')>()),
  streamSection: vi.fn(),
  streamOutline: vi.fn(),
}))

const keys = vi.hoisted(() => ({ order: [{ keyId: null as string | null, label: '' }], problems: [] as unknown[] }))

vi.mock('./settings', async (actual) => ({
  ...(await actual<typeof import('./settings')>()),
  keyOrder: vi.fn(() => keys.order),
  currentSetupProblems: vi.fn(() => keys.problems),
  noteKeyFailure: vi.fn(),
  noteKeySuccess: vi.fn(),
  usePreferences: { getState: () => ({ delaySeconds: 0 }) },
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn() } }))

const { ApiRequestError, streamOutline, streamSection } = await import('./api')
const settings = await import('./settings')
const { toast } = await import('sonner')
const { draftOutline, isRunning, pause, recoverInterruptedBooks, rewriteSection, writeBook } = await import('./runner')
const { sectionKey } = await import('./outline')

// ---- Helpers ----------------------------------------------------------------------------------

const MODEL: ModelRef = { providerId: 'openai', model: 'writer' }
const ID = 'book-1'

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: ID,
    title: 'Tea',
    status: 'writing',
    options: { topic: 'Tea', instructions: '', style: '', complexity: '', seedContent: '', longOutline: false, sectionLength: 'short' },
    models: { outline: MODEL, title: MODEL, section: MODEL },
    reviewOutline: false,
    chapterByChapter: false,
    outline: { Origins: 'Where tea began', Trade: { Ships: 'Clippers', Taxes: 'Duties' } },
    sections: {},
    stats: { inputTokens: 0, outputTokens: 0, modelSeconds: 0 },
    error: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

const saved = () => store.get(ID) as Book
const ORIGINS = sectionKey(['Origins'])
const SHIPS = sectionKey(['Trade', 'Ships'])
const TAXES = sectionKey(['Trade', 'Taxes'])

type SectionCall = Parameters<typeof streamSection>
type Handlers = SectionCall[6]
type Reply = (path: string[], handlers: Handlers, signal: AbortSignal, call: SectionCall) => Promise<void> | void

/** Each section request streams "Text of <title>." and a summary, unless `reply` says otherwise. */
function answerSections(reply?: Reply) {
  vi.mocked(streamSection).mockImplementation(async (...call) => {
    const [, , , path, , , handlers, signal] = call
    if (reply) return reply(path, handlers, signal, call)
    handlers.onDelta(`Text of ${path.at(-1)}.\n\n`)
    handlers.onSummary?.(`Summary of ${path.at(-1)}.`)
    handlers.onStats?.({ input_tokens: 10, output_tokens: 5, total_time: 1 })
  })
}

const failure = (code: string): ApiError => ({ code, title: `Failed: ${code}`, message: code, hint: '' })

/** A request that stays open until Pause aborts it. */
const hang = (signal: AbortSignal) => new Promise<void>((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Paused', 'AbortError'))))

const sectionCalls = () => vi.mocked(streamSection).mock.calls

async function until(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 5))
  expect(check()).toBe(true)
}

beforeEach(() => {
  store.clear()
  vi.clearAllMocks()
  keys.order = [{ keyId: null, label: '' }]
  keys.problems = []
})

// ---- Writing ----------------------------------------------------------------------------------

describe('writeBook', () => {
  it('writes every section in outline order and saves each one', async () => {
    store.set(ID, makeBook())
    answerSections()
    await writeBook(ID)

    expect(sectionCalls().map((c) => c[3])).toEqual([['Origins'], ['Trade', 'Ships'], ['Trade', 'Taxes']])
    const book = saved()
    expect(book.status).toBe('complete')
    expect(book.sections[SHIPS]).toMatchObject({ text: 'Text of Ships.', summary: 'Summary of Ships.', model: MODEL })
    expect(book.stats).toEqual({ inputTokens: 30, outputTokens: 15, modelSeconds: 3 })
    expect(isRunning(ID)).toBe(false)
  })

  it('sends earlier sections, with their summaries, as context', async () => {
    store.set(ID, makeBook())
    answerSections()
    await writeBook(ID)

    expect(sectionCalls()[0][4]).toEqual([])
    expect(sectionCalls()[2][4]).toEqual([
      { path: ['Origins'], text: 'Text of Origins.', summary: 'Summary of Origins.' },
      { path: ['Trade', 'Ships'], text: 'Text of Ships.', summary: 'Summary of Ships.' },
    ])
  })

  it('leaves the summary out when the model wrote none', async () => {
    store.set(ID, makeBook())
    answerSections((path, handlers) => handlers.onDelta(`Text of ${path.at(-1)}.`))
    await writeBook(ID)

    expect(saved().sections[ORIGINS]).not.toHaveProperty('summary')
    expect(sectionCalls()[1][4]).toEqual([{ path: ['Origins'], text: 'Text of Origins.' }])
  })

  it('continues from the first unfinished section', async () => {
    store.set(ID, makeBook({ status: 'paused', sections: { [ORIGINS]: { text: 'Kept.', updatedAt: 1 } } }))
    answerSections()
    await writeBook(ID)

    expect(sectionCalls().map((c) => c[3][1])).toEqual(['Ships', 'Taxes'])
    expect(saved().sections[ORIGINS].text).toBe('Kept.')
  })

  it('pauses without saving the section in progress, and resumes with it', async () => {
    store.set(ID, makeBook())
    answerSections(async (path, handlers, signal) => {
      if (path[1] === 'Ships') {
        handlers.onDelta('Half a sec')
        return hang(signal)
      }
      handlers.onDelta(`Text of ${path.at(-1)}.`)
    })
    const run = writeBook(ID)
    await until(() => sectionCalls().length === 2)
    pause(ID)
    await run

    expect(saved().status).toBe('paused')
    expect(saved().error).toBeNull()
    expect(Object.keys(saved().sections)).toEqual([ORIGINS])

    answerSections()
    await writeBook(ID)
    expect(saved().status).toBe('complete')
    expect(saved().sections[SHIPS].text).toBe('Text of Ships.')
  })

  it('pauses with the error when a request fails', async () => {
    store.set(ID, makeBook())
    answerSections((path, handlers) => {
      if (path[1] === 'Ships') throw new ApiRequestError(failure('model_busy'))
      handlers.onDelta('Done.')
    })
    await writeBook(ID)

    expect(saved().status).toBe('paused')
    expect(saved().error?.code).toBe('model_busy')
    expect(Object.keys(saved().sections)).toEqual([ORIGINS])
  })

  it('stops after each chapter in chapter-by-chapter mode', async () => {
    store.set(ID, makeBook({ chapterByChapter: true }))
    answerSections()
    await writeBook(ID)

    expect(saved().status).toBe('paused')
    expect(Object.keys(saved().sections)).toEqual([ORIGINS])
    expect(toast.success).toHaveBeenCalledOnce()

    // The next chapter is written whole
    await writeBook(ID)
    expect(Object.keys(saved().sections)).toEqual([ORIGINS, SHIPS, TAXES])
  })

  it("doesn't send anything while the book's provider needs setting up", async () => {
    store.set(ID, makeBook({ status: 'paused' }))
    keys.problems = [{ reason: 'needs-key', name: 'OpenAI', model: 'writer' }]
    await writeBook(ID)

    expect(streamSection).not.toHaveBeenCalled()
    expect(saved().error?.code).toBe('needs_setup')
    expect(saved().error?.title).toBe('No API key for OpenAI')
  })
})

// ---- Keys -------------------------------------------------------------------------------------

describe('key failover', () => {
  it('retries the section with the next key, dropping what the failed key wrote', async () => {
    store.set(ID, makeBook())
    keys.order = [
      { keyId: 'k1', label: 'First' },
      { keyId: 'k2', label: 'Second' },
    ]
    answerSections((path, handlers, _signal, call) => {
      if (call[2] === 'k1') {
        handlers.onDelta('Partial text from the first key')
        throw new ApiRequestError(failure('rate_limit'))
      }
      handlers.onDelta(`Text of ${path.at(-1)}.`)
    })
    await writeBook(ID)

    expect(saved().status).toBe('complete')
    expect(saved().sections[ORIGINS].text).toBe('Text of Origins.')
    expect(settings.noteKeyFailure).toHaveBeenCalledWith(MODEL, 'k1', 'rate_limit')
    expect(settings.noteKeySuccess).toHaveBeenCalledWith('k2')
    expect(toast.warning).toHaveBeenCalledWith('First: Failed: rate_limit', { description: 'Trying Second instead.' })
  })

  it("doesn't switch keys for errors another key can't fix", async () => {
    store.set(ID, makeBook())
    keys.order = [
      { keyId: 'k1', label: '' },
      { keyId: 'k2', label: '' },
    ]
    answerSections(() => {
      throw new ApiRequestError(failure('model_busy'))
    })
    await writeBook(ID)

    expect(sectionCalls().map((c) => c[2])).toEqual(['k1'])
    expect(saved().error?.code).toBe('model_busy')
  })

  it('stops with the last error once every key has failed', async () => {
    store.set(ID, makeBook())
    keys.order = [
      { keyId: 'k1', label: '' },
      { keyId: 'k2', label: '' },
    ]
    answerSections((_path, _handlers, _signal, call) => {
      throw new ApiRequestError(failure(call[2] === 'k1' ? 'rate_limit' : 'quota'))
    })
    await writeBook(ID)

    expect(sectionCalls().map((c) => c[2])).toEqual(['k1', 'k2'])
    expect(saved().error?.code).toBe('quota')
  })
})

// ---- Rewrites ---------------------------------------------------------------------------------

describe('rewriteSection', () => {
  const written = () =>
    makeBook({
      status: 'complete',
      sections: {
        [ORIGINS]: { text: 'Old origins.', updatedAt: 1, summary: 'Old summary.' },
        [SHIPS]: { text: 'Ships text.', updatedAt: 1 },
      },
    })

  it('replaces the text and summary, sending the note and the rest of the book', async () => {
    store.set(ID, written())
    const other: ModelRef = { providerId: 'gemini', model: 'flash' }
    answerSections((_path, handlers) => {
      handlers.onDelta('New origins.')
      handlers.onSummary?.('New summary.')
    })
    await rewriteSection(ID, ['Origins'], 'Add a legend', other)

    const [, model, , path, context, revision] = sectionCalls()[0]
    expect(model).toEqual(other)
    expect(path).toEqual(['Origins'])
    expect(context).toEqual([{ path: ['Trade', 'Ships'], text: 'Ships text.' }])
    expect(revision).toEqual({ note: 'Add a legend', previous: 'Old origins.' })
    expect(saved().sections[ORIGINS]).toMatchObject({ text: 'New origins.', summary: 'New summary.', model: other })
    expect(saved().status).toBe('complete')
  })

  it('keeps the original when the rewrite fails', async () => {
    store.set(ID, written())
    answerSections((_path, handlers) => {
      handlers.onDelta('Half a new vers')
      throw new ApiRequestError(failure('timeout'))
    })
    await rewriteSection(ID, ['Origins'], '')

    expect(saved().sections[ORIGINS]).toMatchObject({ text: 'Old origins.', summary: 'Old summary.' })
    expect(saved().error?.code).toBe('timeout')
    expect(saved().status).toBe('complete')
  })

  it('keeps the original, with no error, when paused', async () => {
    store.set(ID, written())
    answerSections((_path, _handlers, signal) => hang(signal))
    const run = rewriteSection(ID, ['Origins'], '')
    await until(() => sectionCalls().length === 1)
    pause(ID)
    await run

    expect(saved().sections[ORIGINS].text).toBe('Old origins.')
    expect(saved().error).toBeNull()
  })
})

// ---- Outline ----------------------------------------------------------------------------------

describe('draftOutline', () => {
  const drafting = (overrides: Partial<Book> = {}) => makeBook({ status: 'drafting', outline: null, title: 'Tea', ...overrides })

  it('saves the outline and title, then waits for review', async () => {
    store.set(ID, drafting({ reviewOutline: true }))
    vi.mocked(streamOutline).mockImplementation(async (_book, _keys, handlers) => {
      handlers.onStage?.('outline')
      handlers.onOutline?.({ Origins: 'Where tea began' })
      handlers.onStage?.('title')
      handlers.onTitle?.('Steeped')
    })
    await draftOutline(ID)

    expect(saved()).toMatchObject({ status: 'review', title: 'Steeped', outline: { Origins: 'Where tea began' } })
    expect(streamSection).not.toHaveBeenCalled()
  })

  it('starts writing straight away without review', async () => {
    store.set(ID, drafting())
    vi.mocked(streamOutline).mockImplementation(async (_book, _keys, handlers) => {
      handlers.onOutline?.({ Origins: 'Where tea began' })
      handlers.onTitle?.('Steeped')
    })
    answerSections()
    await draftOutline(ID)
    await until(() => saved().status === 'complete')

    expect(saved().sections[ORIGINS].text).toBe('Text of Origins.')
  })

  it('keeps the outline for review when only the title fails', async () => {
    store.set(ID, drafting())
    vi.mocked(streamOutline).mockImplementation(async (_book, _keys, handlers) => {
      handlers.onOutline?.({ Origins: 'Where tea began' })
      handlers.onStage?.('title')
      throw new ApiRequestError(failure('model_busy'))
    })
    await draftOutline(ID)

    expect(saved()).toMatchObject({ status: 'review', title: 'Tea', outline: { Origins: 'Where tea began' } })
    expect(saved().error?.code).toBe('model_busy')
  })

  it('retries with the next outline key, and picks the title key again', async () => {
    store.set(ID, drafting({ reviewOutline: true }))
    keys.order = [
      { keyId: 'k1', label: '' },
      { keyId: 'k2', label: '' },
    ]
    vi.mocked(streamOutline).mockImplementation(async (_book, used, handlers) => {
      if (used.outline === 'k1') throw new ApiRequestError(failure('auth'))
      handlers.onOutline?.({ Origins: 'Where tea began' })
      handlers.onTitle?.('Steeped')
    })
    await draftOutline(ID)

    expect(vi.mocked(streamOutline).mock.calls.map((c) => c[1].outline)).toEqual(['k1', 'k2'])
    expect(settings.keyOrder).toHaveBeenCalledTimes(3) // Outline keys, title keys, then title keys again
    expect(saved().status).toBe('review')
  })
})

// ---- After a reload ---------------------------------------------------------------------------

describe('recoverInterruptedBooks', () => {
  it('pauses books that were writing when the page closed', async () => {
    store.set(ID, makeBook({ status: 'writing' }))
    store.set('done', makeBook({ id: 'done', status: 'complete' }))
    await recoverInterruptedBooks()

    expect(saved().status).toBe('paused')
    expect((store.get('done') as Book).status).toBe('complete')
  })
})
