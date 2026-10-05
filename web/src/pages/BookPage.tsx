import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ArrowLeft, Braces, ChevronDown, Download, FileText, FileType2, KeyRound, ListTree, Pause, Play, RefreshCw, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/BookCard'
import { BookCover } from '@/components/BookCover'
import { LogoMark } from '@/components/Logo'
import { OutlineEditor } from '@/components/book/OutlineEditor'
import { Reader } from '@/components/book/Reader'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/misc'
import { Dialog, DialogClose, DialogContent, DialogTrigger, Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/overlays'
import { db, updateBook } from '@/lib/db'
import { downloadBackup, downloadMarkdown, downloadPdf } from '@/lib/export'
import { bookProgress, outlineNodes } from '@/lib/outline'
import { draftOutline, pause, useLive, writeBook } from '@/lib/runner'
import { useProviderList } from '@/lib/settings'
import type { Book, Outline } from '@/lib/types'
import { countWords, formatNumber } from '@/lib/utils'

function ModelLabels({ book }: { book: Book }) {
  const providers = useProviderList()
  const name = (id: string) => providers.find((p) => p.id === id)?.name ?? id
  const { outline, title, section } = book.models
  const same = outline.model === section.model && outline.providerId === section.providerId && title.model === section.model && title.providerId === section.providerId
  // While writing with a service that has several keys, show which key is in use
  const keyLabel = useLive((s) => s.runs[book.id]?.keyLabel)
  const severalKeys = providers.some((p) => p.usableKeys > 1 && Object.values(book.models).some((m) => m.providerId === p.id))
  return (
    <span className="text-xs text-muted-foreground">
      {same ? `${name(section.providerId)} · ${section.model}` : `Chapters: ${name(section.providerId)} · ${section.model} · Outline: ${outline.model} · Title: ${title.model}`}
      {keyLabel && severalKeys && <span className="text-foreground/70"> · {keyLabel}</span>}
    </span>
  )
}

function ErrorBanner({ book, onRetry }: { book: Book; onRetry: () => void }) {
  if (!book.error) return null
  const keyProblem = book.error.code === 'auth' || book.error.code === 'invalid_input'
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 rounded-2xl border border-danger/30 bg-danger/[0.07] p-4 sm:flex-row sm:items-start">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
      <div className="grid min-w-0 gap-1 text-sm">
        <p className="font-semibold text-danger">{book.error.title}</p>
        <p className="break-words text-foreground/80">{book.error.message}</p>
        {book.error.hint && <p className="text-muted-foreground">{book.error.hint}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 sm:ml-auto">
        {keyProblem && (
          <Button asChild variant="outline" size="sm">
            <Link to="/settings">
              <KeyRound /> Settings
            </Link>
          </Button>
        )}
        <Button size="sm" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void updateBook(book.id, { error: null })}>
          Dismiss
        </Button>
      </div>
    </motion.div>
  )
}

function DraftingView({ book }: { book: Book }) {
  const live = useLive((s) => s.runs[book.id])
  const running = Boolean(live)
  const draft: Outline | null = live?.draftOutline ?? null
  const nodes = outlineNodes(draft)

  if (!running) {
    return (
      <div className="surface grid justify-items-center gap-4 p-10 text-center">
        <ListTree className="size-8 text-muted-foreground" />
        <div>
          <p className="font-display text-xl font-medium">The outline hasn't been drafted yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Draft it now with {book.models.outline.model}.</p>
        </div>
        <Button onClick={() => void draftOutline(book.id)}>
          <Play /> Draft the outline
        </Button>
      </div>
    )
  }

  return (
    <div className="surface overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <LogoMark live className="w-10" />
        <AnimatePresence mode="wait">
          <motion.p key={live?.phase} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="text-sm font-medium">
            {live?.phase === 'title' ? 'Choosing a title…' : 'Planning the chapters…'}
          </motion.p>
        </AnimatePresence>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => pause(book.id)}>
          Cancel
        </Button>
      </div>
      <div className="p-6">
        {live?.draftTitle && (
          <motion.p initial={{ opacity: 0, filter: 'blur(6px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} className="mb-5 font-display text-2xl font-medium">
            {live.draftTitle}
          </motion.p>
        )}
        {nodes.length ? (
          <ol className="grid gap-1.5">
            {nodes.map((node, i) => (
              <motion.li
                key={node.key}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.035 }}
                style={{ paddingLeft: `${(node.depth - 1) * 1.25}rem` }}
                className={node.depth === 1 ? 'mt-2 font-display text-base font-medium' : 'text-sm text-muted-foreground'}
              >
                {node.title}
              </motion.li>
            ))}
          </ol>
        ) : (
          <div className="grid gap-3">
            {[72, 56, 64, 48, 60, 52].map((w, i) => (
              <div key={i} className="skeleton h-4" style={{ width: `${w}%`, marginLeft: i % 3 ? '1.25rem' : 0, animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ExportMenu({ book }: { book: Book }) {
  const [busy, setBusy] = useState(false)
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="outline" disabled={busy}>
          <Download /> {busy ? 'Preparing…' : 'Export'} <ChevronDown className="opacity-60" />
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem onSelect={() => downloadMarkdown(book)}>
          <FileText /> Markdown (.md)
        </MenuItem>
        <MenuItem
          onSelect={() => {
            setBusy(true)
            downloadPdf(book)
              .catch((e) => toast.error('PDF export failed', { description: e.message }))
              .finally(() => setBusy(false))
          }}
        >
          <FileType2 /> PDF (.pdf)
        </MenuItem>
        <MenuItem onSelect={() => downloadBackup([book])}>
          <Braces /> Backup (.json)
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

function DeleteButton({ book }: { book: Book }) {
  const navigate = useNavigate()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Delete book">
          <Trash2 />
        </Button>
      </DialogTrigger>
      <DialogContent title="Delete this book?" description={`“${book.title}” will be removed from this browser. This can't be undone. Export a backup first if you want to keep it.`}>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="danger"
            onClick={async () => {
              pause(book.id)
              await db.books.delete(book.id)
              toast.success('Book deleted')
              navigate('/books')
            }}
          >
            <Trash2 /> Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Header({ book }: { book: Book }) {
  const live = useLive((s) => s.runs[book.id])
  const running = Boolean(live)
  const { done, total, ratio } = bookProgress(book)
  const words = Object.values(book.sections).reduce((sum, s) => sum + countWords(s.text), 0)
  const writable = book.status === 'paused' || book.status === 'writing' || book.status === 'complete'

  return (
    <header className="flex flex-col gap-6 sm:flex-row sm:items-end">
      <motion.div initial={{ opacity: 0, rotate: -4, y: 10 }} animate={{ opacity: 1, rotate: 0, y: 0 }} transition={{ type: 'spring', stiffness: 140, damping: 16 }} className="mx-auto shrink-0 sm:mx-0">
        <BookCover title={book.title} topic={book.options.topic} size="lg" className="w-32 p-3.5 sm:w-52 sm:p-5" />
      </motion.div>
      <div className="grid min-w-0 flex-1 gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge book={book} />
          <ModelLabels book={book} />
        </div>
        <h1 className="font-display text-2xl font-medium leading-tight tracking-tight [text-wrap:balance] sm:text-4xl">{book.title}</h1>
        {book.title !== book.options.topic && <p className="text-sm text-muted-foreground">{book.options.topic}</p>}
        {total > 0 && (
          <div className="grid max-w-md gap-1.5">
            <ProgressBar value={ratio} />
            <p className="text-xs text-muted-foreground">
              {done} of {total} sections · {formatNumber(words)} words · {formatNumber(book.stats.outputTokens)} tokens written
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {writable && total > 0 && (
            running ? (
              <Button variant="secondary" onClick={() => pause(book.id)}>
                <Pause /> Pause
              </Button>
            ) : book.status !== 'complete' ? (
              <Button onClick={() => void writeBook(book.id)}>
                <Play /> {book.status === 'paused' || done > 0 ? 'Resume writing' : 'Start writing'}
              </Button>
            ) : null
          )}
          {done > 0 && <ExportMenu book={book} />}
          <DeleteButton book={book} />
        </div>
      </div>
    </header>
  )
}

export function BookPage() {
  const { id } = useParams()
  const book = useLiveQuery(() => (id ? db.books.get(id) : undefined), [id], null)

  if (book === null) return null // Loading
  if (!book) {
    return (
      <div className="mx-auto grid max-w-md justify-items-center gap-4 px-4 py-24 text-center">
        <p className="font-display text-2xl font-medium">Book not found</p>
        <p className="text-sm text-muted-foreground">It may have been deleted, or it was created in another browser.</p>
        <Button asChild variant="outline">
          <Link to="/books">
            <ArrowLeft /> My books
          </Link>
        </Button>
      </div>
    )
  }

  const retry = () => (book.outline ? void writeBook(book.id) : void draftOutline(book.id))

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 pb-32 pt-8 sm:px-6">
      <Link to="/books" className="-mx-2 inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground hover:text-foreground pointer-coarse:py-2.5">
        <ArrowLeft className="size-4" /> My books
      </Link>
      <Header book={book} />
      <ErrorBanner book={book} onRetry={retry} />
      {book.status === 'drafting' && <DraftingView book={book} />}
      {book.status === 'review' && <OutlineEditor key={book.id} book={book} />}
      {book.outline && book.status !== 'review' && book.status !== 'drafting' && <Reader book={book} />}
    </div>
  )
}
