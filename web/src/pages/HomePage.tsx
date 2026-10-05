import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowRight,
  Braces,
  Check,
  Copy,
  Database,
  Download,
  FolderGit2,
  KeyRound,
  ListChecks,
  ListTree,
  Monitor,
  PenLine,
  Plus,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createSearchParams, Link, useLocation, useNavigate } from 'react-router'

import { DotWave } from '@/components/DotWave'
import { LogoMark } from '@/components/Logo'
import { ProviderIcon } from '@/components/ProviderIcon'
import { Button } from '@/components/ui/button'
import { Badge, ProgressBar } from '@/components/ui/misc'
import { db } from '@/lib/db'
import { cn } from '@/lib/utils'

const REPO_URL = 'https://github.com/Sasivarnasarma/infinite-bookshelf'

const EXAMPLES = [
  'Quantum computing for curious beginners',
  'A practical guide to growing vegetables on a balcony',
  'The history of mathematics, told through its big ideas',
  'Personal finance for people who hate spreadsheets',
  'Designing great APIs: a field guide for developers',
  'Stoicism for modern life',
]

function createUrl(topic: string) {
  return topic ? `/new?${createSearchParams({ topic })}` : '/new'
}

function useRotating<T>(items: T[], active: boolean, ms = 3200) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % items.length), ms)
    return () => clearInterval(timer)
  }, [active, items.length, ms])
  return items[index]
}

/** Section heading shared by the landing page's sections. */
function Heading({ eyebrow, title, text, className }: { eyebrow: string; title: string; text?: string; className?: string }) {
  return (
    <div className={cn('grid justify-items-center gap-3 text-center', className)}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="max-w-2xl text-3xl font-medium [text-wrap:balance] sm:text-4xl">{title}</h2>
      {text && <p className="max-w-xl text-muted-foreground [text-wrap:balance]">{text}</p>}
    </div>
  )
}

function useCopy() {
  const [copied, setCopied] = useState(false)
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* Clipboard blocked: the text is still selectable */
    }
  }
  return { copied, copy }
}

// ---- Hero ---------------------------------------------------------------------------------------

function TopicBox() {
  const navigate = useNavigate()
  const [topic, setTopic] = useState('')
  const placeholder = useRotating(EXAMPLES, !topic)

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }} className="mx-auto mt-10 grid w-full max-w-2xl gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          navigate(createUrl(topic.trim()))
        }}
        className="flex items-center gap-2 rounded-full bg-white p-1.5 pl-5 text-left shadow-[0_20px_60px_-20px_rgb(0_0_0/0.45)] ring-1 ring-black/5 max-[359px]:flex-wrap max-[359px]:rounded-3xl max-[359px]:p-2 max-[359px]:pl-4"
      >
        <Sparkles className="size-5 shrink-0 text-[var(--hero-to)] max-[359px]:hidden" />
        <label htmlFor="hero-topic" className="sr-only">
          What should your book be about?
        </label>
        <input
          id="hero-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          maxLength={500}
          placeholder={placeholder}
          autoComplete="off"
          size={1}
          className="min-w-0 flex-1 bg-transparent py-2 text-base text-neutral-900 outline-none placeholder:text-neutral-400 sm:text-lg"
        />
        <Button type="submit" size="lg" className="shrink-0 bg-neutral-900 text-white shadow-none hover:bg-black max-[359px]:w-full">
          <span className="hidden sm:inline">Start writing</span>
          <span className="sm:hidden">Start</span>
          <ArrowRight data-nudge />
        </Button>
      </form>
      <div className="flex flex-wrap justify-center gap-2">
        {EXAMPLES.slice(0, 3).map((example) => (
          <Link key={example} to={createUrl(example)} className="rounded-full border border-white/35 bg-white/10 px-3 py-1 text-xs text-white/90 backdrop-blur-sm transition-all hover:-translate-y-px hover:bg-white/20 pointer-coarse:px-3.5 pointer-coarse:py-3">
            {example}
          </Link>
        ))}
      </div>
    </motion.div>
  )
}

function Hero() {
  const hasBooks = useLiveQuery(async () => (await db.books.count()) > 0, [])
  return (
    <section className="relative isolate overflow-hidden rounded-[1.75rem] bg-[linear-gradient(160deg,var(--hero-from),var(--hero-to))] px-5 pb-52 pt-14 text-center text-white sm:px-6 sm:pb-60 sm:pt-20">
      <DotWave className="-z-10 opacity-70" />
      {/* Sunrise glow, gently breathing */}
      <div className="animate-sunrise absolute -bottom-40 left-1/2 -z-10 h-80 w-[46rem] max-w-[140%] rounded-[50%] bg-[radial-gradient(closest-side,#fff7d6,#ffd27a_35%,rgba(255,170,80,0.55)_60%,transparent)] blur-xl" />
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex justify-center">
        <Link to="/#privacy" className="group inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 py-1 pl-4 pr-1 text-left text-sm font-medium backdrop-blur-sm transition-colors hover:bg-white/20 max-sm:text-xs">
          Open source · Bring your own key · Self-hostable
          <span className="grid size-7 place-items-center rounded-full bg-white text-[var(--hero-to)] transition-transform group-hover:translate-x-0.5">
            <ArrowRight className="size-4" />
          </span>
        </Link>
      </motion.div>
      <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="mx-auto max-w-4xl text-4xl font-medium leading-[1.04] [text-wrap:balance] sm:text-6xl lg:text-7xl">
        Write a whole book from a single idea
      </motion.h1>
      <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/85 [text-wrap:balance] sm:text-lg">
        Pick a topic and a model. Infinite Bookshelf plans the chapters, then writes each one live while you watch.
      </motion.p>
      <TopicBox />
      {hasBooks && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-6 text-sm text-white/80">
          Already writing?{' '}
          <Link to="/books" className="font-medium text-white underline underline-offset-4 hover:no-underline">
            Open your books
          </Link>
        </motion.p>
      )}
    </section>
  )
}

// ---- Live demo ----------------------------------------------------------------------------------

const DEMO_OUTLINE = ['Origins', 'The Tea Road', 'Tea and Empire', 'The Ceremony', 'The Modern Cup']
const DEMO_ACTIVE = 1

const DEMO_TEXT = `## The Tea Road

Long before tea reached Europe, it travelled by horse. Caravans left the misty hills of Yunnan carrying bricks of pressed leaves, packed tight enough to survive months on the road. The route climbed through gorges and over passes higher than the Alps, trading tea for Tibetan horses at markets along the way.

Pressed tea was practical: it kept for years, and pieces could be broken off and used as money. By the time a brick reached Lhasa, it had changed hands a dozen times, and every trader along the road had taken a small share of the journey.`

/**
 * The demo's text as page elements. Its text is fixed, so a full Markdown parser (which would
 * nearly double this page's bundle) isn't needed: "## " starts the heading, blank lines split
 * paragraphs.
 */
function DemoPage({ text, writing }: { text: string; writing: boolean }) {
  const blocks = text.split(/\n{2,}/).filter(Boolean)
  return (
    <div className={cn('reading prose max-w-none text-[15px] sm:text-base [&_h2]:mt-0', writing && '[&>*:last-child]:stream-caret')}>
      {blocks.map((block, i) => (block.startsWith('## ') ? <h2 key={i}>{block.slice(3)}</h2> : <p key={i}>{block}</p>))}
    </div>
  )
}

/** A make-believe book being written, to show what "live" means before anyone signs up for a key. */
function LiveDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '-60px' })
  const reduced = useReducedMotion()
  const tokens = useMemo(() => DEMO_TEXT.split(/(\s+)/), [])
  const [typed, setTyped] = useState(0)
  // With reduced motion the finished page is shown, and nothing animates
  const count = reduced ? tokens.length : typed

  useEffect(() => {
    if (reduced || !inView) return
    // Finished: hold the page for a moment, then write it again
    const delay = count >= tokens.length ? 3600 : 28 + Math.random() * 46
    const timer = setTimeout(() => setTyped((c) => (c >= tokens.length ? 0 : Math.min(c + 2, tokens.length))), delay)
    return () => clearTimeout(timer)
  }, [inView, count, reduced, tokens.length])

  const writing = count < tokens.length
  const text = tokens.slice(0, count).join('')
  const words = text.split(/\s+/).filter((w) => w && !w.startsWith('#')).length
  const progress = (DEMO_ACTIVE + count / tokens.length) / DEMO_OUTLINE.length

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, type: 'spring', stiffness: 140, damping: 22 }}
      className="surface overflow-hidden shadow-[0_40px_100px_-40px_rgb(0_0_0/0.45)]"
      aria-label="Example: a book being written live"
    >
      {/* Window bar */}
      <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </div>
        <LogoMark live={writing} className="w-7" />
        <p className="min-w-0 truncate text-sm font-medium">Steeped: A Short History of Tea</p>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 font-mono text-[11px] text-muted-foreground sm:inline-flex">
            <ProviderIcon id="gemini" className="text-sm" /> gemini-2.5-flash
          </span>
          {writing ? (
            <Badge tone="primary" pulse>
              Writing
            </Badge>
          ) : (
            <Badge tone="success">Section done</Badge>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-[220px_1fr]">
        {/* Outline */}
        <ol className="hidden gap-0.5 border-r border-border p-3 text-sm md:grid md:content-start">
          {DEMO_OUTLINE.map((title, i) => {
            const done = i < DEMO_ACTIVE || (i === DEMO_ACTIVE && !writing)
            const active = i === DEMO_ACTIVE && writing
            return (
              <li key={title} className={cn('flex items-center gap-2.5 rounded-lg px-2.5 py-2', active && 'bg-accent text-accent-foreground', !done && !active && 'text-muted-foreground')}>
                <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-medium', done ? 'border-transparent bg-success text-white' : active ? 'border-primary text-primary' : 'border-border')}>
                  {done ? <Check className="size-3" strokeWidth={3} /> : active ? <span className="size-1.5 animate-pulse rounded-full bg-primary" /> : i + 1}
                </span>
                <span className="truncate">{title}</span>
              </li>
            )
          })}
        </ol>

        {/* Page */}
        <div className="grid min-h-[22rem] content-start gap-4 p-5 sm:p-8">
          <DemoPage text={text} writing={writing} />
        </div>
      </div>

      <div className="flex items-center gap-4 border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <span className="shrink-0">Section 2 of 5</span>
        <ProgressBar value={progress} className="h-1" />
        <span className="shrink-0 font-mono tabular-nums">{words} words</span>
      </div>
    </motion.div>
  )
}

// ---- How it works ---------------------------------------------------------------------------------

const STEPS = [
  { icon: ListTree, title: 'Outline', text: 'Your model drafts the chapters and a title from a single topic.' },
  { icon: ListChecks, title: 'Review', text: 'Rename, reorder, and approve the outline before a word is written.' },
  { icon: PenLine, title: 'Write', text: 'Each section streams in live and builds on the ones before it. Pause any time.' },
  { icon: Download, title: 'Export', text: 'Rewrite any section with a note, then export Markdown, PDF, or a backup.' },
]

function HowItWorks() {
  return (
    <section className="grid gap-10">
      <Heading eyebrow="How it works" title="From one idea to a finished book" text="You stay in charge of the shape of the book. The model does the writing." />
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        className="frame-corners grid gap-px overflow-hidden border-y border-border bg-border sm:grid-cols-2 lg:grid-cols-4"
      >
        {STEPS.map((step, i) => (
          <div key={step.title} className="spotlight group grid content-start gap-3 bg-background p-7">
            <div className="flex items-center justify-between">
              <step.icon className="size-6 text-foreground transition-colors group-hover:text-primary" strokeWidth={1.6} />
              <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
            </div>
            <h3 className="mt-2 text-lg font-medium">{step.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{step.text}</p>
          </div>
        ))}
      </motion.div>
    </section>
  )
}

// ---- Providers ----------------------------------------------------------------------------------

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic Claude' },
  { id: 'gemini', name: 'Google Gemini' },
  { id: 'xai', name: 'xAI Grok' },
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'mistral', name: 'Mistral AI' },
  { id: 'groq', name: 'Groq' },
  { id: 'moonshot', name: 'Moonshot Kimi' },
  { id: 'qwen', name: 'Alibaba Qwen' },
  { id: 'zai', name: 'Z.ai GLM' },
  { id: 'together', name: 'Together AI' },
  { id: 'fireworks', name: 'Fireworks AI' },
  { id: 'cerebras', name: 'Cerebras' },
  { id: 'ollama', name: 'Ollama' },
  { id: 'lmstudio', name: 'LM Studio' },
  { id: 'vllm', name: 'vLLM' },
  { id: 'custom', name: 'Any OpenAI-compatible API' },
]

/** Endless scrolling strip of the providers it works with. */
function Providers() {
  const items = [...PROVIDERS, ...PROVIDERS]
  return (
    <section className="grid gap-8">
      <Heading eyebrow="Bring your own model" title="Use the models you already pay for" text="Mix and match: a fast model for the outline, a stronger one for the chapters, even from different providers." />
      <div className="relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <div className="animate-marquee flex w-max gap-3 hover:[animation-play-state:paused]">
          {items.map((p, i) => (
            <span key={i} className="inline-flex items-center gap-2.5 whitespace-nowrap rounded-full border border-border bg-card py-2 pl-3 pr-4 text-sm text-foreground/80 transition-colors hover:border-primary/40 hover:text-foreground">
              <ProviderIcon id={p.id} className="text-lg" />
              {p.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---- Privacy ------------------------------------------------------------------------------------

const FACTS = [
  {
    icon: KeyRound,
    title: 'Your API keys',
    text: "Saved only in this browser (or just for this tab, if you turn off “Remember my keys”). Each request carries the key it needs; the server uses it, then forgets it. It's never stored or logged.",
  },
  {
    icon: Database,
    title: 'Your books',
    text: "Kept in this browser's database, not on a server. Writing a section sends the outline and earlier sections for context. Back up or move your books from Settings.",
  },
  {
    icon: Server,
    title: 'The server',
    text: "Stateless: no database, no accounts. It turns each request into calls to your provider and streams the result back. Public servers can't be used to reach private networks.",
  },
  {
    icon: ShieldCheck,
    title: 'This page',
    text: 'Loads no third-party scripts, fonts, or trackers, so nothing else can read your keys. Text from models is shown without running any HTML it contains.',
  },
]

/** A dashed line with a dot travelling along it: data moving between two boxes. */
function Flow({ label, reverse }: { label: string; reverse?: boolean }) {
  const reduced = useReducedMotion()
  return (
    <div className="relative flex items-center justify-center py-3 md:py-0" aria-hidden>
      <div className="absolute inset-y-0 left-1/2 w-px bg-[repeating-linear-gradient(to_bottom,var(--border)_0_5px,transparent_5px_9px)] md:inset-x-0 md:inset-y-auto md:top-1/2 md:h-px md:w-auto md:bg-[repeating-linear-gradient(to_right,var(--border)_0_5px,transparent_5px_9px)]" />
      {!reduced && (
        <motion.span
          className="absolute hidden size-2 rounded-full bg-primary shadow-[0_0_12px_var(--primary)] md:block"
          style={{ top: 'calc(50% - 4px)' }}
          animate={{ left: reverse ? ['100%', '0%'] : ['0%', '100%'], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <span className="relative rounded-full border border-border bg-background px-2.5 py-1 font-mono text-[11px] text-muted-foreground">{label}</span>
    </div>
  )
}

function Node({ icon: Icon, title, text, children }: { icon: typeof Monitor; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="surface spotlight grid content-start gap-2 p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-xl bg-accent text-accent-foreground">
          <Icon className="size-[18px]" />
        </span>
        <h3 className="font-medium">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
      {children}
    </div>
  )
}

function Privacy() {
  return (
    <section id="privacy" className="grid scroll-mt-24 gap-10">
      <Heading eyebrow="Privacy by design" title="Your keys and books never leave your hands" text="No accounts and no database. Here's exactly where your data goes." />

      <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} className="grid md:grid-cols-[1fr_9rem_1fr_9rem_1fr] md:items-stretch">
        <Node icon={Monitor} title="Your browser" text="Keeps your API keys and every book you write. Nothing is uploaded to an account." />
        <Flow label="request + key" />
        <Node icon={Server} title="This app's server" text="Uses your key for one request, streams the answer back, and forgets it." />
        <Flow label="your prompt" />
        <Node icon={Sparkles} title="Your AI provider" text="The provider you chose, billed to your own account. Or a local model.">
          <div className="mt-1 flex gap-2 text-lg">
            {['openai', 'anthropic', 'gemini', 'deepseek', 'ollama'].map((id) => (
              <ProviderIcon key={id} id={id} />
            ))}
          </div>
        </Node>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2">
        {FACTS.map((fact, i) => (
          <motion.div
            key={fact.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ delay: i * 0.05 }}
            className="flex gap-4 rounded-2xl border border-border p-5"
          >
            <fact.icon className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="grid gap-1">
              <h3 className="font-medium">{fact.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{fact.text}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ---- Self-hosting -------------------------------------------------------------------------------

const SELF_HOST = `git clone ${REPO_URL}
cd infinite-bookshelf
docker compose up -d`

function SelfHost() {
  const { copied, copy } = useCopy()
  return (
    <section id="self-host" className="frame-corners grid scroll-mt-24 items-center gap-10 border-y border-border py-14 lg:grid-cols-[1fr_1.1fr]">
      <div className="grid gap-4">
        <p className="eyebrow">Open source</p>
        <h2 className="text-3xl font-medium [text-wrap:balance] sm:text-4xl">Run your own copy in a minute</h2>
        <p className="text-muted-foreground">
          Self-hosting means your keys only pass through a server you control, and lets you write with local models like Ollama or LM Studio. One Docker image, no database to set up.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`${REPO_URL}/blob/main/docs/self-hosting.md`} target="_blank" rel="noreferrer">
              <FolderGit2 /> Self-hosting guide
            </a>
          </Button>
          <Button asChild variant="ghost">
            <a href="/api/docs" target="_blank" rel="noreferrer">
              <Braces /> API docs
            </a>
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-[#141414] text-[#e7e5e4] shadow-[0_30px_80px_-40px_rgb(0_0_0/0.5)]">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 text-xs text-white/60">
          <Terminal className="size-4" /> Terminal
          <button type="button" onClick={() => void copy(SELF_HOST)} className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white pointer-coarse:px-3.5 pointer-coarse:py-3" aria-label="Copy commands">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={copied ? 'done' : 'copy'} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} className="inline-flex">
                {copied ? <Check className="size-3.5 text-[#4ade80]" /> : <Copy className="size-3.5" />}
              </motion.span>
            </AnimatePresence>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-7">
          {SELF_HOST.split('\n').map((line) => (
            <div key={line}>
              <span className="select-none text-[#f86522]">$ </span>
              {line}
            </div>
          ))}
          <div className="text-white/45"># then open http://localhost:8000</div>
        </pre>
      </div>
    </section>
  )
}

// ---- FAQ ----------------------------------------------------------------------------------------

const FAQ = [
  {
    q: 'Is it free?',
    a: "The app is free and open source. You pay your AI provider for what you use, and many have free tiers. Local models through Ollama or LM Studio cost nothing.",
  },
  {
    q: 'Which models can I use?',
    a: 'OpenAI, Anthropic Claude, Google Gemini, xAI Grok, DeepSeek, Mistral, Kimi, Qwen, GLM, and more through OpenRouter, Groq, Together, Fireworks, and Cerebras, or any OpenAI-compatible API, including local servers like Ollama and LM Studio when you run your own copy. You can pick a different model for the outline, the title, and the chapters, and add several keys per provider.',
  },
  {
    q: 'Where are my books saved?',
    a: "In this browser's database. There are no accounts, so nothing is uploaded. Export a backup from Settings to keep a copy or move your books to another device.",
  },
  {
    q: 'Can I change what the AI writes?',
    a: 'Yes. Review and reorder the outline before writing starts, then rewrite any section with a note like “add a worked example”. Export to Markdown to edit the text freely.',
  },
  {
    q: 'How long does a book take?',
    a: 'A short book with a fast model takes a few minutes; longer sections and larger models take longer. You can pause at any point and carry on later.',
  },
]

function Faq() {
  return (
    <section className="grid gap-10">
      <Heading eyebrow="Questions" title="Good to know" />
      <div className="mx-auto grid w-full max-w-3xl divide-y divide-border border-y border-border">
        {FAQ.map((item) => (
          <details key={item.q} className="group py-1">
            <summary className="flex cursor-pointer list-none items-center gap-4 py-4 text-left font-medium transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
              {item.q}
              <Plus className="ml-auto size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-45" />
            </summary>
            <p className="pb-5 pr-9 leading-relaxed text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

// ---- Closing call to action --------------------------------------------------------------------

function FinalCta() {
  return (
    <section className="relative isolate overflow-hidden rounded-[1.75rem] bg-[linear-gradient(160deg,var(--hero-from),var(--hero-to))] px-6 py-16 text-center text-white">
      <DotWave className="-z-10 opacity-50" />
      <div className="mx-auto mb-6 grid size-20 place-items-center rounded-3xl bg-white shadow-[0_12px_30px_-10px_rgb(0_0_0/0.35)]">
        <LogoMark animated live className="w-14" />
      </div>
      <h2 className="mx-auto max-w-2xl text-3xl font-medium [text-wrap:balance] sm:text-5xl">Your next book is one idea away</h2>
      <p className="mx-auto mt-4 max-w-md text-white/85 [text-wrap:balance]">Bring a topic and a key. The first chapter starts in under a minute.</p>
      <Button asChild variant="inverse" size="lg" className="mt-8">
        <Link to="/new">
          Start writing <ArrowRight data-nudge />
        </Link>
      </Button>
    </section>
  )
}

// ---- Page ---------------------------------------------------------------------------------------

/** Scrolls to #privacy etc. when the page is opened with a hash, or the hash changes. */
function useHashScroll() {
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    // Wait a frame so the page (and its entrance animation) has laid out
    const frame = requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    return () => cancelAnimationFrame(frame)
  }, [hash])
}

export function HomePage() {
  useHashScroll()
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-24 px-3 pb-24 pt-3 sm:px-4 sm:pt-4">
      <div className="grid grid-cols-1">
        <Hero />
        <div className="relative z-10 mx-auto -mt-44 w-full max-w-5xl px-2 sm:-mt-48 sm:px-6">
          <LiveDemo />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-24 px-1 sm:px-6">
        <HowItWorks />
        <Providers />
        <Privacy />
        <SelfHost />
        <Faq />
        <FinalCta />
        <p className="-mt-12 text-center text-xs leading-relaxed text-muted-foreground">
          Inspired by the original Infinite Bookshelf by Benjamin Klieger · MIT licence
          <br />
          Provider names and logos are trademarks of their owners, shown only to indicate compatibility. Icons by LobeHub (MIT).
        </p>
      </div>
    </div>
  )
}
