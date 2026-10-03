import { exportPdf } from './api'
import { db } from './db'
import { bookToMarkdown } from './outline'
import type { Book } from './types'
import { download, newId, safeFilename } from './utils'

const BACKUP_FORMAT = 'infinite-bookshelf/book'

export function downloadMarkdown(book: Book) {
  download(`${safeFilename(book.title)}.md`, bookToMarkdown(book), 'text/markdown')
}

export async function downloadPdf(book: Book) {
  const blob = await exportPdf(book.title, bookToMarkdown(book))
  download(`${safeFilename(book.title)}.pdf`, blob, 'application/pdf')
}

/** A full backup of one or more books, re-importable on any device. */
export function downloadBackup(books: Book[], name?: string) {
  const data = { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), books }
  const filename = name ?? (books.length === 1 ? safeFilename(books[0].title) : `infinite-bookshelf-${new Date().toISOString().slice(0, 10)}`)
  download(`${filename}.json`, JSON.stringify(data, null, 2), 'application/json')
}

/** Imports a backup made by downloadBackup. Returns how many books were added. */
export async function importBackup(file: File): Promise<number> {
  const data = JSON.parse(await file.text())
  if (data?.format !== BACKUP_FORMAT || !Array.isArray(data.books)) {
    throw new Error("This file isn't an Infinite Bookshelf backup.")
  }
  const now = Date.now()
  const books: Book[] = data.books
    .filter((b: Partial<Book>) => b && typeof b.title === 'string' && b.options && b.models)
    .map((b: Book) => ({
      ...b,
      // A fresh id avoids overwriting a book that's already here
      id: newId(),
      status: b.status === 'writing' || b.status === 'drafting' ? (b.outline ? 'paused' : 'drafting') : b.status,
      sections: b.sections ?? {},
      stats: b.stats ?? { inputTokens: 0, outputTokens: 0, modelSeconds: 0 },
      error: null,
      updatedAt: now,
    }))
  await db.books.bulkAdd(books)
  return books.length
}
