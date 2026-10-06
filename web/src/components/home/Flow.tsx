import { Check, Copy, Terminal as TerminalIcon } from 'lucide-react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

/** The curve a request travels between two boxes (the connector is 9rem × 64px on wide screens). */
const CURVE = 'M 0 32 C 48 -4, 96 68, 144 32'

/**
 * A connector between two boxes: a dashed curve with a glowing packet travelling along it (wide
 * screens), or a dashed line going down (phones). The label says what travels.
 */
export function Connector({ label, delay = 0 }: { label: string; delay?: number }) {
  const reduced = useReducedMotion()
  return (
    <div className="relative flex items-center justify-center py-4 md:py-0" aria-hidden>
      <div className="absolute inset-y-0 left-1/2 w-px bg-[repeating-linear-gradient(to_bottom,var(--border)_0_5px,transparent_5px_9px)] md:hidden" />
      <svg viewBox="0 0 144 64" className="absolute top-1/2 left-0 hidden h-16 w-36 -translate-y-1/2 overflow-visible md:block">
        <path d={CURVE} fill="none" stroke="var(--border)" strokeWidth="1.5" strokeDasharray="5 5" />
        <motion.path
          d={CURVE}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1.5"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, delay: 0.3 + delay, ease: 'easeInOut' }}
          strokeOpacity="0.5"
        />
        {!reduced && (
          <circle r="4.5" fill="var(--primary)" className="drop-shadow-[0_0_6px_var(--primary)]" opacity="0">
            <animateMotion
              path={CURVE}
              dur="2.4s"
              begin={`${1 + delay}s`}
              repeatCount="indefinite"
              keyPoints="0;1"
              keyTimes="0;1"
              calcMode="spline"
              keySplines="0.45 0 0.55 1"
            />
            <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.85;1" dur="2.4s" begin={`${1 + delay}s`} repeatCount="indefinite" />
          </circle>
        )}
      </svg>
      <span className="relative rounded-full border border-border bg-background px-2.5 py-1 font-mono text-[11px] text-muted-foreground md:translate-y-9">
        {label}
      </span>
    </div>
  )
}

/** Shell commands that type themselves out once the terminal scrolls into view. */
export function TypingTerminal({ lines, note }: { lines: string[]; note: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const reduced = useReducedMotion()
  const full = lines.join('\n')
  const [typed, setTyped] = useState(0)
  const count = reduced ? full.length : typed
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!inView || reduced || count >= full.length) return
    const pause = full[count] === '\n' ? 380 : 22 + Math.random() * 40
    const timer = setTimeout(() => setTyped((c) => c + 1), pause)
    return () => clearTimeout(timer)
  }, [inView, reduced, count, full])

  const shown = full.slice(0, count).split('\n')
  const done = count >= full.length

  return (
    <div ref={ref} className="overflow-hidden rounded-2xl border border-border bg-[#151312] text-[#ece7e2] shadow-[0_30px_80px_-40px_rgb(0_0_0/0.6)]">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 text-xs text-white/60">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#ff5f57]/80" />
          <span className="size-2.5 rounded-full bg-[#febc2e]/80" />
          <span className="size-2.5 rounded-full bg-[#28c840]/80" />
        </span>
        <TerminalIcon className="ml-2 size-3.5" /> bash
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              .writeText(full)
              .then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              })
              .catch(() => {})
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white pointer-coarse:px-3.5 pointer-coarse:py-3"
          aria-label="Copy commands"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={copied ? 'done' : 'copy'}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              className="inline-flex"
            >
              {copied ? <Check className="size-3.5 text-[#4ade80]" /> : <Copy className="size-3.5" />}
            </motion.span>
          </AnimatePresence>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="min-h-44 overflow-x-auto p-5 font-mono text-[13px] leading-7" aria-label={full}>
        {shown.map((line, i) => (
          <div key={i}>
            <span className="text-primary select-none">$ </span>
            {line}
            {!done && i === shown.length - 1 && <span className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 animate-caret bg-primary" />}
          </div>
        ))}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: done ? 1 : 0 }} className="text-[#4ade80]/80">
          ✓ {note}
        </motion.div>
      </pre>
    </div>
  )
}
