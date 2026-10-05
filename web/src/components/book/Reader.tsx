import { Check, Copy, ListTree, Loader2, PenLine, Wand2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { memo, useEffect, useRef, useState } from 'react'

import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/fields'
import { Dialog, DialogContent, DialogTrigger, Popover, PopoverContent, PopoverTrigger } from '@/components/ui/overlays'
import { outlineNodes } from '@/lib/outline'
import { isRunning, rewriteSection, useLive, type LiveRun } from '@/lib/runner'
import { usePreferences } from '@/lib/settings'
import type { Book, OutlineNode } from '@/lib/types'
import { cn } from '@/lib/utils'

const READING_SIZE = { sm: 'prose-base', md: 'prose-lg', lg: 'prose-xl' }

function anchor(key: string) {
  return `s-${btoa(encodeURIComponent(key)).replace(/[^a-zA-Z0-9]/g, '')}`
}

// ---- Table of contents ------------------------------------------------------------------------

function scrollToNode(key: string) {
  document.getElementById(anchor(key))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function TocList({ book, live, onPick }: { book: Book; live?: LiveRun; onPick?: () => void }) {
  const nodes = outlineNodes(book.outline)
  return (
      <ol className="grid gap-0.5">
        {nodes.map((node) => {
          const done = Boolean(book.sections[node.key])
          const current = live?.sectionKey === node.key
          return (
            <li key={node.key} style={{ paddingLeft: `${(node.depth - 1) * 0.85}rem` }}>
              <a
                href={`#${anchor(node.key)}`}
                onClick={(e) => {
                  e.preventDefault()
                  onPick?.()
                  // After the sheet (if any) has closed, so the page can scroll
                  requestAnimationFrame(() => scrollToNode(node.key))
                }}
                className={cn(
                  'flex items-start gap-2 rounded-lg px-2 py-1.5 text-[13px] leading-snug transition-colors hover:bg-muted pointer-coarse:py-2.5 pointer-coarse:text-[15px]',
                  !node.isSection && 'mt-2 font-semibold text-foreground',
                  node.isSection && (done ? 'text-muted-foreground' : 'text-foreground/80'),
                  current && 'bg-accent text-accent-foreground',
                )}
              >
                {node.isSection && (
                  <span
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full border-[1.5px]',
                      done ? 'border-success bg-success' : 'border-muted-foreground/40',
                      current && 'animate-pulse-soft border-primary bg-primary',
                    )}
                  />
                )}
                <span>{node.title}</span>
              </a>
            </li>
          )
        })}
      </ol>
  )
}

/** Desktop: contents in a sticky sidebar. */
function Toc({ book, live }: { book: Book; live?: LiveRun }) {
  return (
    <nav className="sticky top-24 hidden max-h-[calc(100dvh-8rem)] overflow-y-auto pr-2 lg:block" aria-label="Contents">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Contents</p>
      <TocList book={book} live={live} />
    </nav>
  )
}

/** Phones and tablets: a floating button that opens the contents as a sheet. */
function MobileToc({ book, live }: { book: Book; live?: LiveRun }) {
  const [open, setOpen] = useState(false)
  // Shown once the reader is into the book, so it never covers the header's buttons
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 320)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  if (!scrolled && !open) return null
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="shadow-xl ring-1 ring-border lg:hidden">
          <ListTree /> Contents
        </Button>
      </DialogTrigger>
      <DialogContent title="Contents" description={book.title} className="max-h-[80dvh]">
        <nav aria-label="Contents" className="-mx-2">
          <TocList book={book} live={live} onPick={() => setOpen(false)} />
        </nav>
      </DialogContent>
    </Dialog>
  )
}

// ---- Section ----------------------------------------------------------------------------------

function RewriteButton({ book, node }: { book: Book; node: OutlineNode }) {
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)
  const busy = isRunning(book.id)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" disabled={busy}>
          <Wand2 /> Rewrite
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        <p className="font-display text-base font-medium">Rewrite “{node.title}”</p>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">The current version is kept until the new one is finished.</p>
        <Textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should change? e.g. Add a worked example, make it shorter…" className="min-h-20" />
        <Button
          className="mt-3 w-full"
          onClick={() => {
            setOpen(false)
            void rewriteSection(book.id, node.path, note)
            setNote('')
          }}
        >
          <Wand2 /> Rewrite section
        </Button>
      </PopoverContent>
    </Popover>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

const HEADING_SPACE = { 1: 'mt-4', 2: 'mt-12', 3: 'mt-10' } as const

const Section = memo(function Section({ book, node, liveText, isLive, rewriting, canEdit, textSize }: { book: Book; node: OutlineNode; liveText?: string; isLive: boolean; rewriting: boolean; canEdit: boolean; textSize: string }) {
  const saved = book.sections[node.key]?.text
  const heading = HEADING_SPACE[Math.min(node.depth, 3) as 1 | 2 | 3]
  const showLive = isLive && (liveText || !saved || rewriting)

  return (
    <section id={anchor(node.key)} className="group scroll-mt-24">
      {node.depth === 1 && <div className="bg-brand mt-16 h-px w-16 opacity-60" />}
      <div className={cn('flex items-baseline gap-3', heading)}>
        <h2 className={cn('font-display font-medium tracking-tight [text-wrap:balance]', node.depth === 1 ? 'text-2xl sm:text-3xl' : node.depth === 2 ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl')}>{node.title}</h2>
        {isLive && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
            <Loader2 className="size-3 animate-spin" /> {rewriting ? 'Rewriting' : 'Writing'}
          </span>
        )}
      </div>
      <div className="mt-3">
        {showLive ? (
          liveText ? (
            <Markdown text={liveText} streaming className={textSize} />
          ) : (
            <div className="grid gap-2.5 py-2">
              <div className="skeleton h-4 w-11/12" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-3/4" />
            </div>
          )
        ) : saved ? (
          <>
            <Markdown text={saved} className={textSize} />
            {canEdit && (
              <div className="mt-2 flex justify-end gap-1 opacity-100 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-within:opacity-100">
                <CopyButton text={saved} />
                <RewriteButton book={book} node={node} />
              </div>
            )}
          </>
        ) : (
          <p className="text-sm italic text-muted-foreground/70">{node.description ? `Not written yet: ${node.description}` : 'Not written yet'}</p>
        )}
      </div>
    </section>
  )
})

// ---- Reader -----------------------------------------------------------------------------------

export function Reader({ book }: { book: Book }) {
  const live = useLive((s) => s.runs[book.id])
  const size = usePreferences((s) => s.readingSize)
  const [follow, setFollow] = useState(true)
  const nodes = outlineNodes(book.outline)
  const lastScroll = useRef(0)

  // Follow along: keep the section being written in view, unless the user scrolled away
  useEffect(() => {
    if (!follow || !live?.sectionKey) return
    const el = document.getElementById(anchor(live.sectionKey))
    if (!el) return
    const now = Date.now()
    if (now - lastScroll.current < 400) return
    lastScroll.current = now
    const rect = el.getBoundingClientRect()
    if (rect.bottom > window.innerHeight - 80 || rect.top > window.innerHeight * 0.6) {
      window.scrollTo({ top: window.scrollY + rect.bottom - window.innerHeight + 140, behavior: 'smooth' })
    }
  }, [follow, live?.sectionKey, live?.text])

  // Stop following as soon as the reader scrolls on their own: mouse wheel, a finger, or the keyboard
  useEffect(() => {
    const stop = () => setFollow(false)
    const onWheel = (e: WheelEvent) => e.deltaY < 0 && stop()
    const onKey = (e: KeyboardEvent) => ['ArrowUp', 'PageUp', 'Home'].includes(e.key) && stop()
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchmove', stop, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchmove', stop)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const canEdit = !live

  return (
    <div className="grid gap-10 lg:grid-cols-[15rem_1fr]">
      <Toc book={book} live={live} />
      <article className="min-w-0 max-w-[44rem]">
        {nodes.map((node) =>
          node.isSection ? (
            <Section key={node.key} book={book} node={node} isLive={live?.sectionKey === node.key} liveText={live?.sectionKey === node.key ? live.text : undefined} rewriting={Boolean(live?.rewriting)} canEdit={canEdit} textSize={READING_SIZE[size]} />
          ) : (
            <div key={node.key} id={anchor(node.key)} className="scroll-mt-24">
              {node.depth === 1 && <div className="bg-brand mt-16 h-px w-16 opacity-60" />}
              <h2 className={cn('font-display font-medium tracking-tight [text-wrap:balance]', node.depth === 1 ? 'mt-4 text-2xl sm:text-3xl' : 'mt-10 text-xl sm:text-2xl')}>{node.title}</h2>
            </div>
          ),
        )}
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center gap-2 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] [&>*]:pointer-events-auto">
          <MobileToc book={book} live={live} />
          <AnimatePresence>
            {live && !follow && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
                <Button variant="secondary" className="shadow-xl ring-1 ring-border" onClick={() => setFollow(true)}>
                  <PenLine /> Follow the writing
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </article>
    </div>
  )
}
