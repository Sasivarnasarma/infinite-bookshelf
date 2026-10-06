import { FileText, FileType2, Braces } from 'lucide-react'
import { motion, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** Restarts a looping illustration every `ms` while it's on screen. */
function useLoop(ms: number) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '-40px' })
  const reduced = useReducedMotion()
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!inView || reduced) return
    const timer = setInterval(() => setTick((t) => t + 1), ms)
    return () => clearInterval(timer)
  }, [inView, reduced, ms])
  return { ref, tick, still: Boolean(reduced) }
}

const Line = ({ w, className }: { w: string; className?: string }) => (
  <span className={cn('block h-1.5 rounded-full bg-muted-foreground/25', className)} style={{ width: w }} />
)

/** An outline drafting itself: a title, then chapters with their sections. */
function OutlineArt() {
  const { ref, tick, still } = useLoop(3600)
  const rows = [
    { w: '70%', indent: 0, strong: true },
    { w: '55%', indent: 1 },
    { w: '62%', indent: 1 },
    { w: '66%', indent: 0, strong: true },
    { w: '48%', indent: 1 },
  ]
  return (
    <div ref={ref} key={tick} className="grid gap-2.5">
      {rows.map((r, i) => (
        <motion.span
          key={i}
          initial={still ? false : { opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15 + i * 0.22 }}
          className="flex items-center gap-2"
          style={{ paddingLeft: r.indent * 14 }}
        >
          <span className={cn('size-1.5 shrink-0 rounded-full', r.strong ? 'bg-primary' : 'bg-muted-foreground/40')} />
          <Line w={r.w} className={r.strong ? 'bg-foreground/35' : undefined} />
        </motion.span>
      ))}
    </div>
  )
}

/** Two chapters swapping places, the way the outline is reordered by dragging. */
function ReviewArt() {
  const { ref, tick } = useLoop(2400)
  const order = tick % 2 === 0 ? ['a', 'b', 'c'] : ['b', 'a', 'c']
  const rows: Record<string, { w: string; accent?: boolean }> = { a: { w: '64%' }, b: { w: '50%', accent: true }, c: { w: '58%' } }
  return (
    <div ref={ref} className="grid gap-2">
      {order.map((id) => (
        <motion.div
          key={id}
          layout
          transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          className={cn(
            'flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2',
            rows[id].accent ? 'border-primary/50 shadow-[0_8px_18px_-10px_var(--primary)]' : 'border-border',
          )}
        >
          <span className="grid grid-cols-2 gap-0.5 opacity-50" aria-hidden>
            {Array.from({ length: 4 }, (_, i) => (
              <span key={i} className="size-0.5 rounded-full bg-foreground" />
            ))}
          </span>
          <Line w={rows[id].w} className={rows[id].accent ? 'bg-primary/60' : undefined} />
        </motion.div>
      ))}
    </div>
  )
}

/** Lines of text filling in, with the caret at the end. */
function WriteArt() {
  const { ref, tick, still } = useLoop(4200)
  const widths = ['100%', '92%', '97%', '60%']
  return (
    <div ref={ref} key={tick} className="grid gap-2.5">
      {widths.map((w, i) => (
        <span key={i} className="flex items-center gap-1" style={{ width: w }}>
          <motion.span
            initial={still ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: i * 0.7, duration: 0.7, ease: 'linear' }}
            className="block h-1.5 flex-1 origin-left rounded-full bg-muted-foreground/25"
          />
          {i === widths.length - 1 && <span className="h-3 w-1 animate-caret rounded-sm bg-primary" />}
        </span>
      ))}
    </div>
  )
}

/** Markdown, PDF and backup files fanning out of the finished book. */
function ExportArt() {
  const { ref, tick, still } = useLoop(3200)
  const files = [
    { icon: FileText, label: '.md', rotate: -14, x: -46 },
    { icon: FileType2, label: '.pdf', rotate: 0, x: 0 },
    { icon: Braces, label: '.json', rotate: 14, x: 46 },
  ]
  return (
    <div ref={ref} key={tick} className="relative grid h-20 place-items-center">
      {files.map((f, i) => (
        <motion.span
          key={f.label}
          initial={still ? false : { y: 26, x: 0, rotate: 0, opacity: 0 }}
          animate={{ y: 0, x: f.x, rotate: f.rotate, opacity: 1 }}
          transition={{ delay: 0.2 + i * 0.12, type: 'spring', stiffness: 220, damping: 16 }}
          className="absolute flex h-16 w-12 flex-col items-center justify-center gap-1 rounded-md border border-border bg-card text-[10px] font-medium text-muted-foreground shadow-md"
        >
          <f.icon className={cn('size-4', i === 1 ? 'text-primary' : 'text-foreground/60')} />
          {f.label}
        </motion.span>
      ))}
    </div>
  )
}

const STEPS: { numeral: string; title: string; text: string; art: ReactNode }[] = [
  { numeral: 'I', title: 'Outline', text: 'Your model drafts the chapters and a title from a single topic.', art: <OutlineArt /> },
  { numeral: 'II', title: 'Review', text: 'Rename, reorder, and approve the outline before a word is written.', art: <ReviewArt /> },
  { numeral: 'III', title: 'Write', text: 'Sections stream in live, each building on the last. Go chapter by chapter, or pause any time.', art: <WriteArt /> },
  { numeral: 'IV', title: 'Export', text: 'Rewrite any section with a note, then export Markdown, a typeset PDF, or a backup.', art: <ExportArt /> },
]

export function Steps() {
  return (
    <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((step, i) => (
        <motion.li
          key={step.title}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ delay: i * 0.08, type: 'spring', stiffness: 120, damping: 18 }}
          className="group relative isolate grid content-start gap-4 overflow-hidden rounded-2xl border border-border bg-card p-6 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-28px_rgb(0_0_0/0.35)]"
        >
          <span
            className="pointer-events-none absolute -right-1 -bottom-10 -z-10 font-serif text-[7rem] leading-none text-primary/[0.07] italic transition-colors duration-500 group-hover:text-primary/15"
            aria-hidden
          >
            {step.numeral}
          </span>
          <div className="grid h-32 content-center rounded-xl bg-[color-mix(in_oklab,var(--muted)_70%,transparent)] p-4">{step.art}</div>
          <div className="grid gap-1.5">
            <h3 className="flex items-baseline gap-2 text-lg font-medium">
              <span className="font-serif text-sm text-primary italic">{step.numeral}.</span>
              {step.title}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{step.text}</p>
          </div>
        </motion.li>
      ))}
    </ol>
  )
}
