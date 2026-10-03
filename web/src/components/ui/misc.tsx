import { motion } from 'motion/react'
import * as React from 'react'

import { cn } from '@/lib/utils'

export function Badge({ className, tone = 'neutral', children, pulse }: { className?: string; tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'; children: React.ReactNode; pulse?: boolean }) {
  const tones = {
    neutral: 'bg-muted text-muted-foreground',
    primary: 'bg-accent text-accent-foreground',
    success: 'bg-success/12 text-success',
    warning: 'bg-warning/15 text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]',
    danger: 'bg-danger/12 text-danger',
    info: 'bg-sky-500/12 text-sky-600 dark:text-sky-300',
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)}>
      <span className={cn('size-1.5 rounded-full bg-current', pulse && 'animate-pulse-soft')} />
      {children}
    </span>
  )
}

/** Animated progress bar with the brand accent. */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div className="bg-brand h-full rounded-full" initial={false} animate={{ width: `${Math.max(value * 100, value > 0 ? 3 : 0)}%` }} transition={{ type: 'spring', stiffness: 120, damping: 24 }} />
    </div>
  )
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{children}</kbd>
}
