/**
 * Books live in this browser's IndexedDB (via Dexie). Nothing is stored on the server.
 */
import Dexie, { type EntityTable } from 'dexie'

import type { Book } from './types'

export const db = new Dexie('infinite-bookshelf') as Dexie & {
  books: EntityTable<Book, 'id'>
}

db.version(1).stores({
  books: 'id, updatedAt, createdAt, status',
})

export async function updateBook(id: string, patch: Partial<Book> | ((book: Book) => Partial<Book>)) {
  await db.transaction('rw', db.books, async () => {
    const book = await db.books.get(id)
    if (!book) return
    const changes = typeof patch === 'function' ? patch(book) : patch
    await db.books.put({ ...book, ...changes, updatedAt: Date.now() })
  })
}
