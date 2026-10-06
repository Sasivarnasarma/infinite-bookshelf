import { motion } from 'motion/react'

import { LogoMark } from '@/components/Logo'
import { ProviderIcon } from '@/components/ProviderIcon'
import { cn } from '@/lib/utils'

import { PROVIDERS } from './providers'

const INNER = PROVIDERS.slice(0, 6)
const OUTER = PROVIDERS.slice(6)

/**
 * One ring of providers. The ring turns; each icon turns the other way at the same speed, so the
 * logos stay upright while they travel.
 */
function Ring({ items, radius, seconds, reverse }: { items: typeof PROVIDERS; radius: number; seconds: number; reverse?: boolean }) {
  const duration = `${seconds}s`
  return (
    <div
      className="absolute top-1/2 left-1/2 rounded-full border border-dashed border-border motion-safe:animate-[orbit_var(--d)_linear_infinite]"
      style={{
        width: radius * 2,
        height: radius * 2,
        marginLeft: -radius,
        marginTop: -radius,
        ['--d' as string]: duration,
        animationDirection: reverse ? 'reverse' : 'normal',
      }}
    >
      {items.map((p, i) => {
        const angle = (i / items.length) * Math.PI * 2
        return (
          <span key={p.id} className="absolute" style={{ left: radius + Math.cos(angle) * radius - 22, top: radius + Math.sin(angle) * radius - 22 }}>
            <span
              className="grid size-11 place-items-center rounded-2xl border border-border bg-card text-xl shadow-[0_10px_24px_-14px_rgb(0_0_0/0.5)] motion-safe:animate-[orbit_var(--d)_linear_infinite]"
              style={{ ['--d' as string]: duration, animationDirection: reverse ? 'normal' : 'reverse' }}
              title={p.name}
            >
              <ProviderIcon id={p.id} />
            </span>
          </span>
        )
      })}
    </div>
  )
}

export function ModelOrbit({ className }: { className?: string }) {
  return (
    <div className={cn('relative mx-auto aspect-square w-full max-w-[26rem] overflow-x-clip [--s:1] max-sm:[--s:0.74]', className)} aria-hidden>
      <div className="absolute inset-0 origin-center scale-(--s)">
        <div className="absolute top-1/2 left-1/2 size-56 -translate-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_22%,transparent),transparent)]" />
        <Ring items={INNER} radius={112} seconds={48} />
        <Ring items={OUTER} radius={184} seconds={72} reverse />
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 160, damping: 14 }}
          className="absolute top-1/2 left-1/2 grid size-24 -translate-1/2 place-items-center rounded-[1.75rem] border border-border bg-card shadow-[0_20px_50px_-20px_var(--primary)]"
        >
          <LogoMark animated live className="w-16" />
        </motion.div>
      </div>
    </div>
  )
}
