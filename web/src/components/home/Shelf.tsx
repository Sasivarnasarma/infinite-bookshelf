import { motion, useReducedMotion } from 'motion/react'
import { createSearchParams, Link } from 'react-router'

import { cn, hueFrom } from '@/lib/utils'

/** Books that could be written: a title for the spine, and the topic a click starts with. */
const BOOKS = [
  { title: 'The Quantum Leap', topic: 'Quantum computing explained for curious beginners' },
  { title: 'Quiet Roots', topic: 'Growing vegetables on a small balcony or windowsill' },
  { title: 'The Pattern Seekers', topic: 'The history of mathematics, told through its big ideas' },
  { title: 'Money Without Fear', topic: 'Personal finance for people who hate spreadsheets' },
  { title: 'Contracts of Trust', topic: 'Designing great APIs: a field guide for developers' },
  { title: 'The Calm Citadel', topic: 'Stoic philosophy for everyday modern life' },
  { title: 'Why Strings Sing', topic: 'The physics of music and sound' },
  { title: 'Rise & Crust', topic: 'Baking sourdough bread from scratch at home' },
  { title: 'Packets & Promises', topic: 'How the internet really works, from cables to clouds' },
  { title: 'Lanterns Overhead', topic: 'A beginner’s field guide to stars and the night sky' },
  { title: 'Steeped', topic: 'A short history of tea and the trade routes it travelled' },
  { title: 'Gentle Machines', topic: 'Machine learning explained without the heavy maths' },
  { title: 'The Yes Room', topic: 'The art of negotiation in work and everyday life' },
  { title: 'First Crack', topic: 'Coffee from bean to cup: growing, roasting and brewing' },
  { title: 'The Inner Theatre', topic: 'An introduction to the philosophy of mind and consciousness' },
  { title: 'One Kanji a Day', topic: 'Learning Japanese step by step, one kanji at a time' },
  { title: 'Small Habits, Big Life', topic: 'Building good habits that last' },
  { title: 'The Empty Map', topic: 'The age of exploration and the explorers who mapped the world' },
  { title: 'Brushstrokes of Light', topic: 'How the Impressionists changed painting' },
  { title: 'Deep Blue Engines', topic: 'Life in the deep ocean and the creatures that live there' },
]

/** Width, height and finish of each spine, picked from the title so the shelf looks hand-filled. */
function spine(title: string) {
  const hash = hueFrom(title + '#')
  return {
    hue: hueFrom(title),
    width: 38 + (hash % 5) * 6,
    height: 212 + (hash % 6) * 12,
    bands: hash % 3,
  }
}

function topicUrl(topic: string) {
  return topic ? `/new?${createSearchParams({ topic })}` : '/new'
}

function Spine({ title, topic, copy }: { title: string; topic: string; copy: boolean }) {
  const { hue, width, height, bands } = spine(title)
  return (
    <Link
      to={topicUrl(topic)}
      aria-label={copy ? undefined : `Start “${title}”: ${topic}`}
      aria-hidden={copy || undefined}
      tabIndex={copy ? -1 : undefined}
      title={copy ? undefined : `${title}: ${topic}`}
      className="group relative shrink-0 self-end outline-none"
      style={{ width, height }}
    >
      <span
        className={cn(
          'absolute inset-0 flex flex-col items-center overflow-hidden rounded-t-[3px] rounded-b-[2px] py-3 text-white',
          'shadow-[inset_-6px_0_10px_-6px_rgb(0_0_0/0.45),inset_3px_0_0_rgb(255_255_255/0.12),0_10px_18px_-12px_rgb(0_0_0/0.6)]',
          'transition-transform duration-300 ease-out group-hover:-translate-y-5 group-focus-visible:-translate-y-5',
          'group-focus-visible:ring-2 group-focus-visible:ring-ring',
        )}
        style={{
          background: `linear-gradient(90deg, oklch(0.42 0.12 ${hue}), oklch(0.56 0.15 ${hue}) 45%, oklch(0.47 0.13 ${(hue + 15) % 360}))`,
        }}
      >
        {bands > 0 && <span className="h-1 w-full shrink-0 bg-white/25" />}
        {bands > 1 && <span className="mt-1 h-px w-full shrink-0 bg-white/25" />}
        <span className="flex min-h-0 w-full flex-1 items-center justify-center py-2">
          <span className="max-h-full overflow-hidden font-serif text-[12.5px] leading-none font-medium tracking-wide text-ellipsis whitespace-nowrap drop-shadow-sm [writing-mode:vertical-rl]">
            {title}
          </span>
        </span>
        <span className="size-1.5 shrink-0 rounded-full bg-white/50" />
      </span>
      {/* Lifted books cast an orange "pick me" glow on the plank */}
      <span className="pointer-events-none absolute inset-x-1 -bottom-2 h-2 rounded-full bg-primary/0 blur-md transition-colors duration-300 group-hover:bg-primary/60" />
    </Link>
  )
}

/**
 * The infinite bookshelf: spines of books that could be written, drifting past on a shelf.
 * Hovering lifts a book; choosing one starts a book on that topic.
 */
export function Shelf({ className }: { className?: string }) {
  const reduced = useReducedMotion()
  const row = (copy: boolean) => (
    <div className="flex shrink-0 items-end gap-1.5 pr-1.5" aria-hidden={copy || undefined}>
      {BOOKS.map((book) => (
        <Spine key={book.title} {...book} copy={copy} />
      ))}
    </div>
  )
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35, type: 'spring', stiffness: 90, damping: 18 }}
      className={cn('relative min-w-0', className)}
    >
      <nav
        aria-label="Book ideas"
        className="relative overflow-x-clip overflow-y-visible mask-[linear-gradient(to_right,transparent,black_10%,black_90%,transparent)] pt-6"
      >
        <div className={cn('flex w-max', !reduced && 'animate-shelf hover:[animation-play-state:paused] has-focus-visible:[animation-play-state:paused]')}>
          {row(false)}
          {row(true)}
        </div>
      </nav>
      {/* The plank */}
      <div className="relative h-3.5 rounded-sm bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--primary)_55%,#7a3b16),color-mix(in_oklab,var(--primary)_30%,#3d1d0b))] shadow-[0_18px_30px_-14px_rgb(0_0_0/0.55)]">
        <div className="absolute inset-x-0 top-0 h-px bg-white/30" />
      </div>
    </motion.div>
  )
}
