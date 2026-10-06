import { motion } from 'motion/react'
import { useId, type CSSProperties } from 'react'

import { cn } from '@/lib/utils'

const LOOP =
  'M100 60 C 88 42, 72 30, 55 30 C 36 30, 22 44, 22 60 C 22 76, 36 90, 55 90 C 72 90, 88 78, 100 60 C 112 42, 128 30, 145 30 C 164 30, 178 44, 178 60 C 178 76, 164 90, 145 90 C 128 90, 112 78, 100 60 Z'

const LEFT_BOOKS = [
  { x: 36, y: 48, w: 7, h: 25, c: '#FFC56B' },
  { x: 44, y: 42, w: 6, h: 31, c: '#FFAA4C' },
  { x: 51, y: 50, w: 7, h: 23, c: '#FF8A3D' },
  { x: 59, y: 44, w: 6, h: 29, c: '#F86522' },
  { x: 68, y: 47, w: 6, h: 26, c: '#E5481A', tilt: true },
]
const RIGHT_BOOKS = [
  { x: 123, y: 46, w: 6, h: 27, c: '#E5481A' },
  { x: 130, y: 50, w: 7, h: 23, c: '#F86522' },
  { x: 138, y: 42, w: 6, h: 31, c: '#FF8A3D' },
  { x: 145, y: 48, w: 7, h: 25, c: '#FFAA4C' },
  { x: 153, y: 52, w: 6, h: 21, c: '#FFC56B' },
]

/**
 * The Infinite Bookshelf mark: an infinity loop with a shelf of books in each loop.
 *
 * - `animated`: the loop draws itself in and the books rise, on first render.
 * - `live`: a comet of light travels the figure-eight forever and the books bob in a wave.
 *   The same motion plays on hover of the mark (or of a parent with the `group` class).
 * All motion is CSS/SVG (see .ib-logo in index.css) and stops for reduced-motion users.
 */
export function LogoMark({ className, animated = false, live = false }: { className?: string; animated?: boolean; live?: boolean }) {
  const id = useId().replace(/:/g, '')

  const books = (list: typeof LEFT_BOOKS, offset: number) =>
    list.map((b, i) => {
      const rect = (
        <motion.rect
          className="ib-book"
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          rx={1.5}
          fill={b.c}
          initial={animated ? { scaleY: 0, opacity: 0 } : false}
          animate={{ scaleY: 1, opacity: 1 }}
          style={{ transformOrigin: `${b.x}px 73px`, transformBox: 'view-box', '--i': offset + i } as CSSProperties}
          transition={{ delay: 0.35 + (offset + i) * 0.05, type: 'spring', stiffness: 260, damping: 18 }}
        />
      )
      // The leaning book's tilt lives on a wrapper, so the bob animation can't override it
      return 'tilt' in b && b.tilt ? (
        <g key={b.x} transform={`rotate(12 ${b.x + 3} 73)`}>
          {rect}
        </g>
      ) : (
        <g key={b.x}>{rect}</g>
      )
    })

  return (
    <svg
      viewBox="0 0 200 120"
      className={cn('ib-logo h-auto overflow-visible', className)}
      data-live={live || undefined}
      role="img"
      aria-label="Infinite Bookshelf"
    >
      <defs>
        <linearGradient id={`${id}-loop`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFB547" />
          <stop offset="0.35" stopColor="#FF8A3D" />
          <stop offset="0.65" stopColor="#F86522" />
          <stop offset="1" stopColor="#E5481A" />
        </linearGradient>
        <clipPath id={`${id}-l`}>
          <ellipse cx="57" cy="60" rx="25" ry="21" />
        </clipPath>
        <clipPath id={`${id}-r`}>
          <ellipse cx="143" cy="60" rx="25" ry="21" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-l)`}>
        <rect x="30" y="73" width="54" height="4" rx="2" fill="#A8A29E" opacity="0.7" />
        {books(LEFT_BOOKS, 0)}
      </g>
      <g clipPath={`url(#${id}-r)`}>
        <rect x="116" y="73" width="54" height="4" rx="2" fill="#A8A29E" opacity="0.7" />
        {books(RIGHT_BOOKS, 5)}
      </g>
      <motion.path
        d={LOOP}
        fill="none"
        stroke={`url(#${id}-loop)`}
        strokeWidth={11}
        strokeLinejoin="round"
        initial={animated ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
      />
      {/* The comet: a soft trail and a bright head travelling the figure-eight */}
      <path className="ib-comet ib-comet-trail" d={LOOP} pathLength={1} fill="none" stroke="#FFF4E0" strokeWidth={9} strokeLinecap="round" />
      <path className="ib-comet ib-comet-head" d={LOOP} pathLength={1} fill="none" stroke="#FFFFFF" strokeWidth={6} strokeLinecap="round" />
    </svg>
  )
}

export function Wordmark({ className, live }: { className?: string; live?: boolean }) {
  return (
    <span className={cn('group inline-flex items-center gap-2.5', className)}>
      <LogoMark className="w-11" live={live} />
      <span className="font-sans text-[17px] font-medium tracking-tight max-[359px]:sr-only">
        Infinite <span className="text-brand">Bookshelf</span>
      </span>
    </span>
  )
}

/** Full-area loading state: the mark, tracing its loop. */
export function LogoLoader({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <div className={cn('grid place-items-center gap-3', className)} role="status" aria-label={label}>
      <LogoMark live className="w-24" />
    </div>
  )
}
