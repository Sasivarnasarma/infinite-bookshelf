import { useLiveQuery } from 'dexie-react-hooks'
import { Download, Plus, Search, Upload } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { BookCard } from '@/components/BookCard'
import { LogoMark } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect, Segmented } from '@/components/ui/fields'
import { db } from '@/lib/db'
import { downloadBackup, importBackup } from '@/lib/export'
import type { Book } from '@/lib/types'

type Filter = 'all' | 'progress' | 'finished'
type Sort = 'updated' | 'created' | 'title'

const SORTS: Record<Sort, (a: Book, b: Book) => number> = {
  updated: (a, b) => b.updatedAt - a.updatedAt,
  created: (a, b) => b.createdAt - a.createdAt,
  title: (a, b) => a.title.localeCompare(b.title),
}

function EmptyLibrary() {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="surface grid justify-items-center gap-5 px-6 py-16 text-center">
      <LogoMark animated live className="w-28" />
      <div className="grid gap-1.5">
        <p className="font-display text-2xl font-medium">Your shelf is empty</p>
        <p className="max-w-sm text-sm text-muted-foreground">Books you write are saved here, in this browser. Start with any topic you're curious about.</p>
      </div>
      <Button asChild variant="brand" size="lg">
        <Link to="/">
          <Plus /> Write your first book
        </Link>
      </Button>
    </motion.div>
  )
}

export function BooksPage() {
  const books = useLiveQuery(() => db.books.toArray(), [])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('updated')
  const fileInput = useRef<HTMLInputElement>(null)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (books ?? [])
      .filter((b) => (filter === 'all' ? true : filter === 'finished' ? b.status === 'complete' : b.status !== 'complete'))
      .filter((b) => !q || b.title.toLowerCase().includes(q) || b.options.topic.toLowerCase().includes(q))
      .sort(SORTS[sort])
  }, [books, query, filter, sort])

  async function onImport(file: File) {
    try {
      const count = await importBackup(file)
      toast.success(`Imported ${count} book${count === 1 ? '' : 's'}`)
    } catch (e) {
      toast.error('Import failed', { description: (e as Error).message })
    }
  }

  if (books === undefined) return null

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-24 pt-10 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-4xl font-medium tracking-tight">My books</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {books.length} book{books.length === 1 ? '' : 's'}, saved in this browser
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void onImport(e.target.files[0])} />
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            <Upload /> Import
          </Button>
          {books.length > 0 && (
            <Button variant="outline" onClick={() => downloadBackup(books)}>
              <Download /> Back up all
            </Button>
          )}
          <Button asChild>
            <Link to="/">
              <Plus /> New book
            </Link>
          </Button>
        </div>
      </div>

      {books.length === 0 ? (
        <EmptyLibrary />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search books…" className="pl-9" />
            </div>
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'progress', label: 'In progress' },
                { value: 'finished', label: 'Finished' },
              ]}
            />
            <NativeSelect value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="sm:ml-auto sm:w-48" aria-label="Sort books">
              <option value="updated">Recently updated</option>
              <option value="created">Newest first</option>
              <option value="title">Title A–Z</option>
            </NativeSelect>
          </div>

          <motion.div layout className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {visible.map((book, i) => (
                <BookCard key={book.id} book={book} index={i} />
              ))}
            </AnimatePresence>
          </motion.div>
          {visible.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No books match.</p>}
        </>
      )}
    </div>
  )
}
