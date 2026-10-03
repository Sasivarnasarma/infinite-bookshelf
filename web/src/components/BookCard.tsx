import { motion } from 'motion/react'
import type * as React from 'react'
import { Link } from 'react-router'

import { BookCover } from '@/components/BookCover'
import { Badge, ProgressBar } from '@/components/ui/misc'
import { bookProgress } from '@/lib/outline'
import { useLive } from '@/lib/runner'
import type { Book } from '@/lib/types'
import { cn, timeAgo } from '@/lib/utils'

export function StatusBadge({ book }: { book: Book }) {
  const running = useLive((s) => Boolean(s.runs[book.id]))
  if (running || book.status === 'writing') return <Badge tone="primary" pulse>{book.status === 'drafting' ? 'Drafting' : 'Writing'}</Badge>
  if (book.error) return <Badge tone="danger">Needs attention</Badge>
  switch (book.status) {
    case 'drafting':
      return <Badge tone="warning">Outline not drafted</Badge>
    case 'review':
      return <Badge tone="info">Review outline</Badge>
    case 'paused':
      return <Badge tone="warning">Paused</Badge>
    case 'complete':
      return <Badge tone="success">Finished</Badge>
  }
}

export function BookCard({ book, index = 0, className, ref }: { book: Book; index?: number; className?: string; ref?: React.Ref<HTMLDivElement> }) {
  const { done, total, ratio } = bookProgress(book)
  return (
    <motion.div
      ref={ref}
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ delay: Math.min(index, 8) * 0.04, type: 'spring', stiffness: 300, damping: 30 }}
      className={cn('group', className)}
    >
      <Link to={`/books/${book.id}`} className="surface spotlight flex h-full flex-col gap-4 p-4 transition-all duration-300 hover:-translate-y-1 hover:border-[color-mix(in_oklab,var(--primary)_35%,var(--border))] hover:shadow-[0_24px_48px_-24px_rgba(0,0,0,0.3)]">
        <div className="px-6 pt-2 transition-transform duration-500 group-hover:-rotate-1 group-hover:scale-[1.02]">
          <BookCover title={book.title} topic={book.options.topic} />
        </div>
        <div className="mt-auto grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <StatusBadge book={book} />
            <span className="text-xs text-muted-foreground">{timeAgo(book.updatedAt)}</span>
          </div>
          <h3 className="line-clamp-2 font-display text-base font-medium leading-snug">{book.title}</h3>
          {total > 0 ? (
            <div className="grid gap-1.5">
              <ProgressBar value={ratio} />
              <span className="text-xs text-muted-foreground">
                {done} of {total} sections
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">{book.options.topic}</span>
          )}
        </div>
      </Link>
    </motion.div>
  )
}
