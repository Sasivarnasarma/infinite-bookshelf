import { motion, useInView, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { LogoMark } from '@/components/Logo'
import { ProviderIcon } from '@/components/ProviderIcon'
import { cn } from '@/lib/utils'

const CONTENTS = [
  { title: 'Origins', page: 1 },
  { title: 'The Tea Road', page: 14 },
  { title: 'Tea and Empire', page: 31 },
  { title: 'The Ceremony', page: 47 },
  { title: 'The Modern Cup', page: 62 },
]
const ACTIVE = 1

const TEXT = `Long before tea reached Europe, it travelled by horse. Caravans left the misty hills of Yunnan carrying bricks of pressed leaves, packed tight enough to survive months on the road.

The route climbed through gorges and over passes higher than the Alps, trading tea for Tibetan horses at markets along the way. Pressed tea was practical: it kept for years, and pieces could be broken off and used as money.

By the time a brick reached Lhasa, it had changed hands a dozen times, and every trader along the road had taken a small share of the journey.`

function Contents({ writing }: { writing: boolean }) {
  return (
    <div className="grid content-start gap-5">
      <p className="font-serif text-sm tracking-[0.3em] text-muted-foreground uppercase">Contents</p>
      <ol className="grid gap-2.5 font-serif text-[15px]">
        {CONTENTS.map((c, i) => {
          const done = i < ACTIVE || (i === ACTIVE && !writing)
          const active = i === ACTIVE && writing
          return (
            <li key={c.title} className={cn('relative flex items-baseline gap-2', !done && !active && 'text-muted-foreground/70')}>
              {active && <motion.span layoutId="demo-ribbon" className="absolute top-0 -left-5 h-6 w-1.5 rounded-b-sm bg-primary sm:-left-7" />}
              <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{['I', 'II', 'III', 'IV', 'V'][i]}</span>
              <span className={cn(active && 'font-medium text-primary', done && 'text-foreground')}>{c.title}</span>
              <span className="mb-1 min-w-4 flex-1 border-b border-dotted border-muted-foreground/40" />
              <span className="text-xs text-muted-foreground tabular-nums">{c.page}</span>
            </li>
          )
        })}
      </ol>
      <div className="mt-auto hidden items-center gap-2 pt-6 text-xs text-muted-foreground md:flex">
        <LogoMark live={writing} className="w-7" />
        Steeped: A Short History of Tea
      </div>
    </div>
  )
}

/**
 * A book open on the desk, writing its second chapter: what "live" means, before anyone needs a key.
 * The book tilts back and settles flat as it scrolls into view.
 */
export function OpenBookDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '-80px' })
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] })
  const rotateX = useTransform(scrollYProgress, [0, 1], [22, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [0.92, 1])

  const tokens = useMemo(() => TEXT.split(/(\s+)/), [])
  const [typed, setTyped] = useState(0)
  const count = reduced ? tokens.length : typed
  useEffect(() => {
    if (reduced || !inView) return
    const delay = count >= tokens.length ? 3800 : 26 + Math.random() * 44
    const timer = setTimeout(() => setTyped((c) => (c >= tokens.length ? 0 : Math.min(c + 2, tokens.length))), delay)
    return () => clearTimeout(timer)
  }, [inView, count, reduced, tokens.length])

  const writing = count < tokens.length
  const paragraphs = tokens
    .slice(0, count)
    .join('')
    .split(/\n{2,}/)
  const words = paragraphs.join(' ').split(/\s+/).filter(Boolean).length

  return (
    <div ref={ref} className="[perspective:1600px]" aria-label="Example: a book being written live" role="figure">
      <motion.div style={reduced ? undefined : { rotateX, scale }} className="relative origin-bottom">
        {/* Status floating over the spine */}
        <div className="absolute -top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs shadow-lg">
          <ProviderIcon id="gemini" className="text-sm" />
          <span className="font-mono whitespace-nowrap text-muted-foreground">gemini-3.8-flash</span>
          <span className={cn('flex items-center gap-1.5 font-medium', writing ? 'text-primary' : 'text-success')}>
            <span className={cn('size-1.5 rounded-full', writing ? 'animate-pulse-soft bg-primary' : 'bg-success')} />
            {writing ? 'Writing' : 'Done'}
          </span>
        </div>

        {/* Cover edges peeking out under the pages */}
        <div className="absolute inset-x-2 -bottom-2 h-full rounded-2xl bg-[color-mix(in_oklab,var(--primary)_70%,#5b2a10)] shadow-[0_40px_80px_-30px_rgb(0_0_0/0.55)]" />
        <div className="absolute inset-x-1 -bottom-1 h-full rounded-2xl bg-[color-mix(in_oklab,var(--card)_80%,var(--muted))]" />

        <div className="relative grid overflow-hidden rounded-2xl border border-border bg-card md:grid-cols-2">
          {/* The gutter: pages curving into the spine */}
          <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 hidden w-24 -translate-x-1/2 bg-[linear-gradient(to_right,transparent,rgb(0_0_0/0.07)_45%,rgb(0_0_0/0.14)_50%,rgb(0_0_0/0.07)_55%,transparent)] md:block dark:bg-[linear-gradient(to_right,transparent,rgb(0_0_0/0.35)_45%,rgb(0_0_0/0.55)_50%,rgb(0_0_0/0.35)_55%,transparent)]" />

          <div className="hidden p-8 pr-14 pl-10 md:grid lg:p-12 lg:pr-16">
            <Contents writing={writing} />
          </div>

          <div className="relative grid min-h-96 content-start gap-4 p-6 pt-10 sm:p-10 md:pl-14 lg:p-12 lg:pl-16">
            <p className="font-serif text-xs tracking-[0.3em] text-muted-foreground uppercase">Chapter II</p>
            <h3 className="font-serif text-2xl font-medium tracking-tight sm:text-3xl">The Tea Road</h3>
            <div className={cn('reading grid gap-3 font-serif text-[15px] leading-7 sm:text-base', writing && '[&>*:last-child]:stream-caret')}>
              {paragraphs.map((p, i) => (
                <p
                  key={i}
                  className={cn(
                    i === 0 &&
                      'first-letter:float-left first-letter:mr-2 first-letter:font-serif first-letter:text-5xl first-letter:leading-[0.9] first-letter:text-primary',
                  )}
                >
                  {p}
                </p>
              ))}
            </div>
            <div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted-foreground tabular-nums">
              <span>{words} words</span>
              <span>14</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
