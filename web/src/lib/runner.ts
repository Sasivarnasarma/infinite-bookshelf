/**
 * Book generation, driven from the browser.
 *
 * The API is stateless, so the browser decides what to write next: draft the outline, then
 * stream each unfinished section in order, saving it to IndexedDB when it completes. Pause aborts
 * the current request; Resume starts again at the first unfinished section (a half-written
 * section is simply rewritten). Runs live outside React, so navigating between pages doesn't
 * stop them. Closing the tab does; the book then waits for Resume.
 *
 * In chapter-by-chapter mode the run stops after each chapter, so the reader can check it (rewrite
 * a section, switch the model) before asking for the next one.
 *
 * Each request picks an API key for its service (see keyOrder): the first key, or the next in
 * turn when rotating. If a key fails in a way another key could fix (rejected key, rate limit or
 * quota, model not available), the same request is retried with the service's next key.
 */
import { toast } from 'sonner'
import { create } from 'zustand'

import { ApiRequestError, streamOutline, streamSection, type ServerStats } from './api'
import { db, updateBook } from './db'
import { outlineNodes, pendingSections, sectionKey } from './outline'
import { currentSetupProblems, KEY_FAILOVER_CODES, keyOrder, modelsInUse, noteKeyFailure, noteKeySuccess, usePreferences, type KeyChoice } from './settings'
import type { ApiError, Book, ModelRef, Outline, Stats } from './types'
import { isAbort, sleep } from './utils'

// ---- Live state (what's streaming right now) --------------------------------------------------

export interface LiveRun {
  phase: 'outline' | 'title' | 'sections'
  /** Section being written (or rewritten) and its text so far. */
  sectionKey: string | null
  text: string
  /** True while rewriting one finished section. */
  rewriting: boolean
  draftOutline: Outline | null
  draftTitle: string | null
  /** Label of the API key the current request uses (when the service has several). */
  keyLabel: string | null
}

interface LiveState {
  runs: Record<string, LiveRun>
  set: (bookId: string, patch: Partial<LiveRun>) => void
  end: (bookId: string) => void
}

const NEW_RUN: LiveRun = { phase: 'sections', sectionKey: null, text: '', rewriting: false, draftOutline: null, draftTitle: null, keyLabel: null }

export const useLive = create<LiveState>()((set) => ({
  runs: {},
  set: (bookId, patch) => set((s) => ({ runs: { ...s.runs, [bookId]: { ...(s.runs[bookId] ?? NEW_RUN), ...patch } } })),
  end: (bookId) =>
    set((s) => {
      const runs = { ...s.runs }
      delete runs[bookId]
      return { runs }
    }),
}))

const controllers = new Map<string, AbortController>()

export function isRunning(bookId: string): boolean {
  return controllers.has(bookId)
}

export function pause(bookId: string) {
  controllers.get(bookId)?.abort()
}

function begin(bookId: string): AbortController {
  controllers.get(bookId)?.abort()
  const controller = new AbortController()
  controllers.set(bookId, controller)
  return controller
}

function finish(bookId: string, controller: AbortController) {
  if (controllers.get(bookId) === controller) {
    controllers.delete(bookId)
    useLive.getState().end(bookId)
  }
}

function addStats(stats: Stats, s: ServerStats): Stats {
  return {
    inputTokens: stats.inputTokens + (s.input_tokens || 0),
    outputTokens: stats.outputTokens + (s.output_tokens || 0),
    modelSeconds: stats.modelSeconds + (s.total_time || 0),
  }
}

function asApiError(e: unknown): ApiError {
  if (e instanceof ApiRequestError) return e.error
  return { code: 'unknown', title: 'Something went wrong', message: e instanceof Error ? e.message : String(e), hint: '' }
}

/**
 * Batches streamed text into ~20 UI updates per second, so long sections stay smooth while the
 * markdown re-renders.
 */
function textBuffer(bookId: string) {
  let text = ''
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    timer = null
    useLive.getState().set(bookId, { text })
  }
  return {
    append(chunk: string) {
      text += chunk
      if (!timer) timer = setTimeout(flush, 50)
    },
    get text() {
      return text
    },
    /** Drops what was received so far (a retry with another key starts the section again). */
    reset() {
      text = ''
      if (timer) clearTimeout(timer)
      timer = null
      useLive.getState().set(bookId, { text: '' })
    },
    stop() {
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}

// ---- API keys: failover and rotation -----------------------------------------------------------

function canTryAnotherKey(e: unknown): e is ApiRequestError {
  return e instanceof ApiRequestError && KEY_FAILOVER_CODES.has(e.error.code)
}

function announceSwitch(failed: KeyChoice, next: KeyChoice, error: ApiError) {
  toast.warning(`${failed.label || 'Key'}: ${error.title}`, { description: `Trying ${next.label || 'the next key'} instead.` })
}

/** Runs one request with the service's keys in order until one succeeds (or none are left). */
async function withKeys<T>(bookId: string, ref: ModelRef, run: (key: KeyChoice) => Promise<T>): Promise<T> {
  const order = keyOrder(ref)
  for (let i = 0; ; i++) {
    useLive.getState().set(bookId, { keyLabel: order[i].label || null })
    try {
      const result = await run(order[i])
      noteKeySuccess(order[i].keyId)
      return result
    } catch (e) {
      if (!canTryAnotherKey(e)) throw e
      noteKeyFailure(ref, order[i].keyId, e.error.code)
      if (i + 1 >= order.length) throw e
      announceSwitch(order[i], order[i + 1], e.error)
    }
  }
}

// ---- Setup -------------------------------------------------------------------------------------

/** Code of the error saved on a book whose provider needs setting up (the book page shows a setup card). */
export const NEEDS_SETUP = 'needs_setup'

/**
 * Checks the models a request would use before sending anything. If a provider was removed or has
 * no usable key, the book gets an error saying so (and nothing is sent), and this returns true.
 */
async function blockedBySetup(book: Book, refs: ModelRef[] = modelsInUse(book)): Promise<boolean> {
  const problem = currentSetupProblems(refs)[0]
  if (!problem) return false
  const title =
    problem.reason === 'needs-key'
      ? `No API key for ${problem.name}`
      : problem.reason === 'needs-url'
        ? `${problem.name} has no address`
        : `${problem.name} isn't set up`
  await updateBook(book.id, {
    error: { code: NEEDS_SETUP, title, message: `This book writes with ${problem.model}.`, hint: 'Add a key, or switch the book to a model you have set up.' },
  })
  return true
}

// ---- Outline ----------------------------------------------------------------------------------

/** Drafts the outline and title. Then waits for review, or starts writing right away. */
export async function draftOutline(bookId: string): Promise<void> {
  const book = await db.books.get(bookId)
  if (!book || (await blockedBySetup(book, [book.models.outline, book.models.title]))) return
  const controller = begin(bookId)
  const live = useLive.getState()
  live.set(bookId, { phase: 'outline', draftOutline: null, draftTitle: null })
  await updateBook(bookId, { status: 'drafting', error: null })

  let outline = null as Outline | null
  let title = null as string | null
  let stats = book.stats
  try {
    // One request covers both steps; a key failure retries it with the next key of the step that failed
    const outlineKeys = keyOrder(book.models.outline)
    let titleKeys = keyOrder(book.models.title)
    let o = 0
    let t = 0
    for (;;) {
      let stage = 'outline' as 'outline' | 'title' // Updated by onStage as the stream moves on
      live.set(bookId, { keyLabel: outlineKeys[o].label || null })
      try {
        await streamOutline(
          book,
          { outline: outlineKeys[o].keyId, title: titleKeys[t].keyId },
          {
            onStage: (next) => {
              stage = next
              live.set(bookId, { phase: next, keyLabel: (next === 'title' ? titleKeys[t] : outlineKeys[o]).label || null })
            },
            onOutline: (structure) => {
              outline = structure as Outline
              live.set(bookId, { draftOutline: outline })
            },
            onTitle: (value) => {
              title = value
              live.set(bookId, { draftTitle: value })
            },
            onStats: (s) => (stats = addStats(stats, s)),
          },
          controller.signal,
        )
        noteKeySuccess(outlineKeys[o].keyId)
        noteKeySuccess(titleKeys[t].keyId)
        break
      } catch (e) {
        if (!canTryAnotherKey(e)) throw e
        if (stage === 'title') noteKeyFailure(book.models.title, titleKeys[t].keyId, e.error.code)
        else noteKeyFailure(book.models.outline, outlineKeys[o].keyId, e.error.code)
        if (stage === 'title' && t + 1 < titleKeys.length) {
          announceSwitch(titleKeys[t], titleKeys[t + 1], e.error)
          t++
        } else if (stage === 'outline' && o + 1 < outlineKeys.length) {
          announceSwitch(outlineKeys[o], outlineKeys[o + 1], e.error)
          o++
          // The key that just failed is now set aside, so the title step picks its key again
          titleKeys = keyOrder(book.models.title)
          t = 0
        } else throw e
      }
    }
    await updateBook(bookId, {
      outline,
      title: title ?? book.title,
      stats,
      status: book.reviewOutline ? 'review' : 'writing',
    })
    finish(bookId, controller)
    if (!book.reviewOutline) void writeBook(bookId)
  } catch (e) {
    finish(bookId, controller)
    const error = isAbort(e) ? null : asApiError(e)
    if (outline) {
      // The outline arrived but the title didn't: keep the outline and let the user review it
      await updateBook(bookId, { outline, title: title ?? book.title, stats, status: 'review', error })
    } else {
      await updateBook(bookId, { status: 'drafting', error })
    }
  }
}

// ---- Sections ---------------------------------------------------------------------------------

function writtenSections(book: Book) {
  return outlineNodes(book.outline)
    .filter((n) => n.isSection && book.sections[n.key])
    .map((n) => ({ path: n.path, text: book.sections[n.key].text }))
}

/**
 * Writes every unfinished section in order. Each finished section is saved immediately, so
 * pausing or closing the tab loses at most the section in progress.
 */
export async function writeBook(bookId: string): Promise<void> {
  const start = await db.books.get(bookId)
  if (!start || (await blockedBySetup(start, [start.models.section]))) return
  const controller = begin(bookId)
  const { signal } = controller
  const live = useLive.getState()
  await updateBook(bookId, { status: 'writing', error: null })

  try {
    let first = true
    for (;;) {
      const book = await db.books.get(bookId)
      if (!book) return
      const next = pendingSections(book)[0]
      const model = book.models.section
      if (!next) {
        await updateBook(bookId, { status: 'complete' })
        break
      }
      const delay = usePreferences.getState().delaySeconds
      if (!first && delay > 0) await sleep(delay * 1000, signal)
      first = false

      live.set(bookId, { phase: 'sections', sectionKey: next.key, text: '', rewriting: false })
      const buffer = textBuffer(bookId)
      let stats = book.stats
      try {
        await withKeys(bookId, model, (key) => {
          buffer.reset()
          stats = book.stats
          return streamSection(
            book,
            model,
            key.keyId,
            next.path,
            writtenSections(book),
            null,
            { onDelta: (t) => buffer.append(t), onStats: (s) => (stats = addStats(stats, s)) },
            signal,
          )
        })
      } finally {
        buffer.stop()
      }
      const text = buffer.text
      await updateBook(bookId, (b) => ({
        sections: { ...b.sections, [next.key]: { text, updatedAt: Date.now(), model } },
        stats,
      }))

      // Chapter by chapter: stop once this chapter is finished (read fresh, the setting may have changed)
      const after = await db.books.get(bookId)
      const upcoming = after && pendingSections(after)[0]
      if (after?.chapterByChapter && upcoming && upcoming.path[0] !== next.path[0]) {
        await updateBook(bookId, { status: 'paused' })
        toast.success(`“${next.path[0]}” is written`, { description: 'Read it over, then write the next chapter when you’re ready.' })
        break
      }
    }
  } catch (e) {
    await updateBook(bookId, isAbort(e) ? { status: 'paused' } : { status: 'paused', error: asApiError(e) })
  } finally {
    finish(bookId, controller)
  }
}

/**
 * Rewrites one finished section with an optional note. The current text stays saved until the
 * new version is complete, so pausing or an error keeps the original.
 */
export async function rewriteSection(bookId: string, path: string[], note: string, model?: ModelRef): Promise<void> {
  const book = await db.books.get(bookId)
  if (!book) return
  const ref = model ?? book.models.section
  if (await blockedBySetup(book, [ref])) return
  const key = sectionKey(path)
  const previous = book.sections[key]?.text ?? ''
  const controller = begin(bookId)
  const live = useLive.getState()
  const statusBefore = book.status
  live.set(bookId, { phase: 'sections', sectionKey: key, text: '', rewriting: true })
  await updateBook(bookId, { status: 'writing', error: null })

  const buffer = textBuffer(bookId)
  let stats = book.stats
  // Context: everything written except the section being rewritten
  const written = writtenSections(book).filter((w) => sectionKey(w.path) !== key)
  try {
    await withKeys(bookId, ref, (key) => {
      buffer.reset()
      stats = book.stats
      return streamSection(
        book,
        ref,
        key.keyId,
        path,
        written,
        { note, previous },
        { onDelta: (t) => buffer.append(t), onStats: (s) => (stats = addStats(stats, s)) },
        controller.signal,
      )
    })
    buffer.stop()
    await updateBook(bookId, (b) => ({
      sections: { ...b.sections, [key]: { text: buffer.text, updatedAt: Date.now(), model: ref } },
      stats,
      status: statusBefore === 'writing' ? 'paused' : statusBefore,
    }))
  } catch (e) {
    buffer.stop()
    await updateBook(bookId, {
      status: statusBefore === 'writing' ? 'paused' : statusBefore,
      error: isAbort(e) ? null : asApiError(e),
    })
  } finally {
    finish(bookId, controller)
  }
}

/** After a reload nothing is running: books left mid-run become paused (or drafting). */
export async function recoverInterruptedBooks() {
  const books = await db.books.where('status').anyOf('writing').toArray()
  await Promise.all(books.filter((b) => !isRunning(b.id)).map((b) => updateBook(b.id, { status: 'paused' })))
}
