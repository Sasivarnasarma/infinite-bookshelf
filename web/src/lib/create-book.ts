import { db } from './db'
import { draftOutline } from './runner'
import { rememberModels } from './settings'
import type { Book, BookOptions, ModelRef, Step } from './types'
import { newId } from './utils'

export async function createBook(options: BookOptions, models: Record<Step, ModelRef>, reviewOutline: boolean, chapterByChapter: boolean): Promise<string> {
  const now = Date.now()
  const book: Book = {
    id: newId(),
    title: options.topic,
    status: 'drafting',
    options,
    models,
    reviewOutline,
    chapterByChapter,
    outline: null,
    sections: {},
    stats: { inputTokens: 0, outputTokens: 0, modelSeconds: 0 },
    error: null,
    createdAt: now,
    updatedAt: now,
  }
  await db.books.add(book)
  rememberModels([models.section, models.outline, models.title])
  void draftOutline(book.id)
  return book.id
}
