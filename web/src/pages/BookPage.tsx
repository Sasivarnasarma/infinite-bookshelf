import { useLiveQuery } from 'dexie-react-hooks'
import {
  AlertTriangle,
  ArrowLeft,
  Braces,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  FileType2,
  KeyRound,
  ListTree,
  Pause,
  PenLine,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useId, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/BookCard'
import { BookCover } from '@/components/BookCover'
import { LogoMark } from '@/components/Logo'
import { ModelSelect } from '@/components/ModelSelect'
import { AddProviderDialog } from '@/components/settings/AddProviderDialog'
import { OutlineEditor } from '@/components/book/OutlineEditor'
import { Reader } from '@/components/book/Reader'
import { Button } from '@/components/ui/button'
import { Input, Switch } from '@/components/ui/fields'
import { ProgressBar } from '@/components/ui/misc'
import { Dialog, DialogClose, DialogContent, DialogTrigger, Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/overlays'
import { db, updateBook } from '@/lib/db'
import { downloadBackup, downloadMarkdown, downloadPdf } from '@/lib/export'
import { bookProgress, nextChapter, outlineNodes } from '@/lib/outline'
import { draftOutline, NEEDS_SETUP, pause, useLive, writeBook } from '@/lib/runner'
import { modelOptions, modelsInUse, sameRef, setupProblems, useProviderList, useServer, type SetupProblem } from '@/lib/settings'
import type { Book, ModelRef, Outline } from '@/lib/types'
import { bookWords, cleanTitle, formatNumber, MAX_TITLE_CHARS, readingTime } from '@/lib/utils'

function ModelLabels({ book }: { book: Book }) {
  const providers = useProviderList()
  const name = (id: string) => providers.find((p) => p.id === id)?.name ?? id
  const { outline, title, section } = book.models
  const same =
    outline.model === section.model && outline.providerId === section.providerId && title.model === section.model && title.providerId === section.providerId
  // While writing with a service that has several keys, show which key is in use
  const keyLabel = useLive((s) => s.runs[book.id]?.keyLabel)
  const severalKeys = providers.some((p) => p.usableKeys > 1 && Object.values(book.models).some((m) => m.providerId === p.id))
  return (
    <span className="text-xs text-muted-foreground">
      {same
        ? `${name(section.providerId)} · ${section.model}`
        : `Chapters: ${name(section.providerId)} · ${section.model} · Outline: ${outline.model} · Title: ${title.model}`}
      {keyLabel && severalKeys && <span className="text-foreground/70"> · {keyLabel}</span>}
    </span>
  )
}

/** The model for the chapters still to write, and whether to stop after each chapter. */
function WritingControls({ book, running }: { book: Book; running: boolean }) {
  const providers = useProviderList()
  const options = useMemo(() => modelOptions(providers), [providers])
  return (
    <div className="grid max-w-xl grid-cols-1 gap-3 rounded-2xl border border-border/80 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="grid min-w-0 gap-1.5">
        <label htmlFor="book-model" className="text-xs font-medium text-muted-foreground">
          Model for the next sections
        </label>
        <ModelSelect
          id="book-model"
          step="section"
          value={book.models.section}
          options={options}
          disabled={running}
          onChange={(ref) => ref && void updateBook(book.id, (b) => ({ models: { ...b.models, section: ref } }))}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2.5 text-sm sm:h-10 pointer-coarse:sm:h-11">
        <Switch checked={Boolean(book.chapterByChapter)} onCheckedChange={(chapterByChapter) => void updateBook(book.id, { chapterByChapter })} /> One chapter
        at a time
      </label>
      {running && (
        <p className="text-xs text-muted-foreground sm:col-span-2">Pause to switch models. The section being written finishes with the current one.</p>
      )}
    </div>
  )
}

/** What stops the book's next request: a removed provider, or one without a usable key. */
function useSetupProblems(book: Book): SetupProblem[] {
  const providers = useProviderList()
  const loaded = useServer((s) => s.config !== null)
  return useMemo(() => (loaded ? setupProblems(providers, modelsInUse(book)) : []), [loaded, providers, book])
}

const SETUP_TITLE: Record<SetupProblem['reason'], (name: string) => string> = {
  'needs-key': (name) => `Add an API key for ${name} to keep writing`,
  off: (name) => `Connect ${name} to keep writing`,
  removed: (name) => `${name} was removed`,
  'needs-url': (name) => `${name} needs its address`,
}

/** Shown instead of starting a request that can't work: set the provider up again, or switch models. */
function SetupCard({ book, problem }: { book: Book; problem: SetupProblem }) {
  const providers = useProviderList()
  const options = useMemo(() => modelOptions(providers), [providers])
  const [dialog, setDialog] = useState({ open: false, session: 0 })
  const builtIn = providers.find((p) => p.id === problem.providerId && !p.custom)
  const switchTo = (ref: ModelRef) =>
    void updateBook(book.id, (b) => ({
      error: null,
      // Before the outline, every step still to run moves; after it, only the chapters
      models: b.outline ? { ...b.models, section: ref } : { outline: ref, title: ref, section: ref },
    }))
  const others = options.filter((o) => !sameRef(o, { providerId: problem.providerId, model: problem.model }))

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      role="status"
      className="grid grid-cols-1 gap-4 rounded-2xl border border-dashed border-primary/40 bg-accent/40 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="grid min-w-0 gap-0.5">
          <p className="text-sm font-medium">{SETUP_TITLE[problem.reason](problem.name)}</p>
          <p className="text-xs text-muted-foreground">
            This book writes with {problem.model}.{' '}
            {problem.reason === 'removed'
              ? 'Add a provider, or switch to a model you have.'
              : 'Keys are saved only in this browser, and writing picks up where it stopped.'}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Button className="w-full sm:w-auto" onClick={() => setDialog((d) => ({ open: true, session: d.session + 1 }))}>
          <KeyRound /> {builtIn ? `Set up ${builtIn.name}` : 'Add a provider'}
        </Button>
        {others.length > 0 && (
          <div className="grid min-w-0 flex-1 gap-1.5 sm:max-w-sm">
            <label htmlFor="setup-switch-model" className="text-xs text-muted-foreground">
              Or switch this book to
            </label>
            <ModelSelect
              id="setup-switch-model"
              step="section"
              value={null}
              emptyLabel="Choose a model you have"
              options={others}
              onChange={(ref) => ref && switchTo(ref)}
            />
          </div>
        )}
      </div>
      <AddProviderDialog
        key={dialog.session}
        open={dialog.open}
        initial={builtIn?.id ?? null}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        providers={providers}
        onConnected={(id) => {
          void updateBook(book.id, { error: null })
          toast.success(`${providers.find((p) => p.id === id)?.name ?? 'Provider'} is connected`, { description: 'Press Resume to carry on writing.' })
        }}
      />
    </motion.div>
  )
}

/** The model the book's next request uses: the outline's until there is one, then the chapters'. */
const nextModel = (book: Book) => (book.outline ? book.models.section : book.models.outline)

/**
 * Moves the book's next request to `ref`: the chapters once there's an outline. Before it, the
 * outline moves, and so do the title and chapters if they were using the same model.
 */
function switchModel(bookId: string, ref: ModelRef) {
  return updateBook(bookId, (b) => {
    if (b.outline) return { error: null, models: { ...b.models, section: ref } }
    const follow = (m: ModelRef) => (sameRef(m, b.models.outline) ? ref : m)
    return { error: null, models: { outline: ref, title: follow(b.models.title), section: follow(b.models.section) } }
  })
}

function ErrorBanner({ book, onRetry }: { book: Book; onRetry: () => void }) {
  const providers = useProviderList()
  const options = useMemo(() => modelOptions(providers), [providers])
  const switchId = useId()
  // Setup problems get the setup card instead
  if (!book.error || book.error.code === NEEDS_SETUP) return null
  const { title, message, hint, detail, code } = book.error
  const keyProblem = code === 'auth' || code === 'quota' || code === 'invalid_input'
  const others = options.filter((o) => !sameRef(o, nextModel(book)))

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      role="alert"
      className="grid grid-cols-1 gap-4 rounded-2xl border border-danger/30 bg-danger/[0.07] p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
        <div className="grid min-w-0 flex-1 gap-1.5 text-sm">
          <p className="font-semibold text-danger">{title}</p>
          {message && message !== title && <p className="wrap-break-word text-foreground/85">{message}</p>}
          {hint && <p className="text-muted-foreground">{hint}</p>}
          {detail && (
            <details className="group mt-1">
              <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-xs text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" /> Show full error
              </summary>
              <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-border/80 bg-background/60 p-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-foreground/80">
                {detail}
              </pre>
            </details>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:pl-8">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onRetry}>
            <RefreshCw /> Try again
          </Button>
          {keyProblem && (
            <Button asChild variant="outline" size="sm">
              <Link to="/settings">
                <KeyRound /> Settings
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => void updateBook(book.id, { error: null })}>
            Dismiss
          </Button>
        </div>
        {others.length > 0 && (
          <div className="grid min-w-0 flex-1 gap-1.5 sm:max-w-sm">
            <label htmlFor={switchId} className="text-xs text-muted-foreground">
              Or try again with another model
            </label>
            <ModelSelect
              id={switchId}
              step={book.outline ? 'section' : 'outline'}
              value={null}
              emptyLabel="Choose a model"
              options={others}
              onChange={(ref) => ref && void switchModel(book.id, ref).then(onRetry)}
            />
          </div>
        )}
      </div>
    </motion.div>
  )
}

function DraftingView({ book, blocked }: { book: Book; blocked: boolean }) {
  const providers = useProviderList()
  const options = useMemo(() => modelOptions(providers), [providers])
  const modelId = useId()
  const live = useLive((s) => s.runs[book.id])
  const running = Boolean(live)
  const draft: Outline | null = live?.draftOutline ?? null
  const nodes = outlineNodes(draft)

  if (!running) {
    return (
      <div className="surface grid justify-items-center gap-5 p-8 text-center sm:p-10">
        <ListTree className="size-8 text-muted-foreground" />
        <div>
          <p className="font-display text-xl font-medium">The outline hasn't been drafted yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Choose the model that plans the chapters, then draft it.</p>
        </div>
        <div className="grid w-full max-w-sm gap-1.5 text-left">
          <label htmlFor={modelId} className="text-xs font-medium text-muted-foreground">
            Outline model
          </label>
          <ModelSelect id={modelId} step="outline" value={book.models.outline} options={options} onChange={(ref) => ref && void switchModel(book.id, ref)} />
        </div>
        <Button disabled={blocked} onClick={() => void draftOutline(book.id)}>
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
          <motion.p
            key={live?.phase}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="text-sm font-medium"
          >
            {live?.phase === 'title' ? 'Choosing a title…' : 'Planning the chapters…'}
          </motion.p>
        </AnimatePresence>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => pause(book.id)}>
          Cancel
        </Button>
      </div>
      <div className="p-6">
        {live?.draftTitle && (
          <motion.p
            initial={{ opacity: 0, filter: 'blur(6px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            className="mb-5 font-display text-2xl font-medium"
          >
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

function RenameButton({ book }: { book: Book }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(book.title)
  const inputId = useId()
  const next = cleanTitle(title)
  const save = async () => {
    if (!next) return
    if (next !== book.title) await updateBook(book.id, { title: next })
    setOpen(false)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setTitle(book.title)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Rename book" title="Rename">
          <PenLine />
        </Button>
      </DialogTrigger>
      <DialogContent title="Rename book" description="The new title is used in the library, the reader and exports.">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Title
          </label>
          <Input id={inputId} autoFocus value={title} maxLength={MAX_TITLE_CHARS} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!next}>
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
      <DialogContent
        title="Delete this book?"
        description={`“${book.title}” will be removed from this browser. This can't be undone. Export a backup first if you want to keep it.`}
      >
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

function Header({ book, blocked }: { book: Book; blocked: boolean }) {
  const live = useLive((s) => s.runs[book.id])
  const running = Boolean(live)
  const { done, total, ratio } = bookProgress(book)
  const words = bookWords(book)
  const writable = book.status === 'paused' || book.status === 'writing' || book.status === 'complete'
  const chapter = book.chapterByChapter ? nextChapter(book) : null
  const resumeLabel = chapter
    ? `${chapter.started ? 'Continue' : 'Write'} chapter ${chapter.number}`
    : book.status === 'paused' || done > 0
      ? 'Resume writing'
      : 'Start writing'

  return (
    <header className="flex flex-col gap-6 sm:flex-row sm:items-end">
      <motion.div
        initial={{ opacity: 0, rotate: -4, y: 10 }}
        animate={{ opacity: 1, rotate: 0, y: 0 }}
        transition={{ type: 'spring', stiffness: 140, damping: 16 }}
        className="mx-auto shrink-0 sm:mx-0"
      >
        <BookCover title={book.title} topic={book.options.topic} size="lg" className="w-32 p-3.5 sm:w-52 sm:p-5" />
      </motion.div>
      <div className="grid min-w-0 flex-1 gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge book={book} />
          <ModelLabels book={book} />
        </div>
        <h1 className="font-display text-2xl leading-tight font-medium tracking-tight text-balance sm:text-4xl">{book.title}</h1>
        {book.title !== book.options.topic && <p className="text-sm text-muted-foreground">{book.options.topic}</p>}
        {total > 0 && (
          <div className="grid max-w-md gap-1.5">
            <ProgressBar value={ratio} />
            <p className="text-xs text-muted-foreground">
              {done} of {total} sections · {formatNumber(words)} words{words > 0 && ` · ${readingTime(words)}`} · {formatNumber(book.stats.outputTokens)} tokens
              written
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {writable &&
            total > 0 &&
            (running ? (
              <Button variant="secondary" onClick={() => pause(book.id)}>
                <Pause /> Pause
              </Button>
            ) : book.status !== 'complete' ? (
              <Button disabled={blocked} onClick={() => void writeBook(book.id)}>
                <Play /> {resumeLabel}
              </Button>
            ) : null)}
          {done > 0 && <ExportMenu book={book} />}
          <RenameButton book={book} />
          <DeleteButton book={book} />
        </div>
        {writable && total > 0 && book.status !== 'complete' && <WritingControls book={book} running={running} />}
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

  return <BookView book={book} />
}

function BookView({ book }: { book: Book }) {
  const running = useLive((s) => Boolean(s.runs[book.id]))
  const setup = useSetupProblems(book)[0]
  const blocked = Boolean(setup)
  const retry = () => (book.outline ? void writeBook(book.id) : void draftOutline(book.id))

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 pt-8 pb-32 sm:px-6">
      <Link
        to="/books"
        className="-mx-2 inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground hover:text-foreground pointer-coarse:py-2.5"
      >
        <ArrowLeft className="size-4" /> My books
      </Link>
      <Header book={book} blocked={blocked} />
      {setup && !running && <SetupCard book={book} problem={setup} />}
      <ErrorBanner book={book} onRetry={retry} />
      {book.status === 'drafting' && <DraftingView book={book} blocked={blocked} />}
      {book.status === 'review' && <OutlineEditor key={book.id} book={book} />}
      {book.outline && book.status !== 'review' && book.status !== 'drafting' && <Reader book={book} />}
    </div>
  )
}
