/**
 * Book generation, driven from the browser.
 *
 * The API is stateless, so the browser decides what to write next: draft the outline, then
 * stream each unfinished section in order, saving it to IndexedDB when it completes. Pause aborts
 * the current request; Resume starts again at the first unfinished section (a half-written
 * section is simply rewritten). Runs live outside React, so navigating between pages doesn't
 * stop them. Closing the tab does; the book then waits for Resume.
 */
import { create } from 'zustand'

import { ApiRequestError, streamOutline, streamSection, type ServerStats } from './api'
import { db, updateBook } from './db'
import { outlineNodes, pendingSections, sectionKey } from './outline'
import { usePreferences } from './settings'
import type { ApiError, Book, Outline, Stats } from './types'
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
}

interface LiveState {
  runs: Record<string, LiveRun>
  set: (bookId: string, patch: Partial<LiveRun>) => void
  end: (bookId: string) => void
}

const NEW_RUN: LiveRun = { phase: 'sections', sectionKey: null, text: '', rewriting: false, draftOutline: null, draftTitle: null }

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
    stop() {
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}

// ---- Outline ----------------------------------------------------------------------------------

/** Drafts the outline and title. Then waits for review, or starts writing right away. */
export async function draftOutline(bookId: string): Promise<void> {
  const book = await db.books.get(bookId)
  if (!book) return
  const controller = begin(bookId)
  const live = useLive.getState()
  live.set(bookId, { phase: 'outline', draftOutline: null, draftTitle: null })
  await updateBook(bookId, { status: 'drafting', error: null })

  let outline = null as Outline | null
  let title = null as string | null
  let stats = book.stats
  try {
    await streamOutline(
      book,
      {
        onStage: (stage) => live.set(bookId, { phase: stage }),
        onOutline: (structure) => {
          outline = structure as Outline
          live.set(bookId, { draftOutline: outline })
        },
        onTitle: (t) => {
          title = t
          live.set(bookId, { draftTitle: t })
        },
        onStats: (s) => (stats = addStats(stats, s)),
      },
      controller.signal,
    )
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
        await streamSection(
          book,
          next.path,
          writtenSections(book),
          null,
          { onDelta: (t) => buffer.append(t), onStats: (s) => (stats = addStats(stats, s)) },
          signal,
        )
      } finally {
        buffer.stop()
      }
      const text = buffer.text
      await updateBook(bookId, (b) => ({
        sections: { ...b.sections, [next.key]: { text, updatedAt: Date.now() } },
        stats,
      }))
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
export async function rewriteSection(bookId: string, path: string[], note: string): Promise<void> {
  const book = await db.books.get(bookId)
  if (!book) return
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
    await streamSection(
      book,
      path,
      written,
      { note, previous },
      { onDelta: (t) => buffer.append(t), onStats: (s) => (stats = addStats(stats, s)) },
      controller.signal,
    )
    buffer.stop()
    await updateBook(bookId, (b) => ({
      sections: { ...b.sections, [key]: { text: buffer.text, updatedAt: Date.now() } },
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
