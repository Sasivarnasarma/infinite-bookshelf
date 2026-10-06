import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Braces, Database, FolderGit2, KeyRound, Minus, Monitor, Plus, Server, ShieldCheck, Sparkles } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { createSearchParams, Link, useLocation, useNavigate } from 'react-router'

import { Connector, TypingTerminal } from '@/components/home/Flow'
import { ModelOrbit } from '@/components/home/ModelOrbit'
import { OpenBookDemo } from '@/components/home/OpenBookDemo'
import { PROVIDERS } from '@/components/home/providers'
import { Shelf } from '@/components/home/Shelf'
import { Steps } from '@/components/home/Steps'
import { LogoMark } from '@/components/Logo'
import { ProviderIcon } from '@/components/ProviderIcon'
import { Button } from '@/components/ui/button'
import { apiUrl } from '@/lib/api-url'
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

const reveal = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { type: 'spring', stiffness: 110, damping: 20 },
} as const

/** Sections are the chapters of this page: "Chapter I", then the title. */
function ChapterHeading({
  label,
  title,
  text,
  center = true,
  className,
}: {
  label: string
  title: ReactNode
  text?: string
  center?: boolean
  className?: string
}) {
  return (
    <motion.div {...reveal} className={cn('grid gap-3', center && 'justify-items-center text-center', className)}>
      <p className="flex items-center gap-3 font-serif text-sm text-primary italic">
        <span className="h-px w-8 bg-primary/40" />
        {label}
        {center && <span className="h-px w-8 bg-primary/40" />}
      </p>
      <h2 className="max-w-2xl font-serif text-3xl leading-tight font-medium tracking-[-0.02em] text-balance sm:text-[2.6rem]">{title}</h2>
      {text && <p className="max-w-xl leading-relaxed text-balance text-muted-foreground">{text}</p>}
    </motion.div>
  )
}

/** A thin ribbon under the header that fills as the page is read. */
function ReadingRibbon() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.3 })
  return <motion.div aria-hidden style={{ scaleX }} className="bg-brand fixed inset-x-0 top-16 z-30 h-0.5 origin-left" />
}

// ---- Prologue -----------------------------------------------------------------------------------

const GLYPHS = [
  { char: '¶', className: 'top-[14%] left-[6%] text-6xl', y: -14, duration: 7 },
  { char: '§', className: 'top-[52%] left-[11%] text-5xl', y: 12, duration: 9 },
  { char: '“', className: 'top-[20%] right-[8%] text-8xl', y: 16, duration: 8 },
  { char: '✦', className: 'top-[58%] right-[12%] text-3xl', y: -10, duration: 6 },
  { char: '&', className: 'top-[38%] right-[3%] text-5xl', y: -12, duration: 10 },
]

/** Literary marks drifting in the hero's margins. */
function FloatingGlyphs() {
  const reduced = useReducedMotion()
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden font-serif text-primary/15 lg:block">
      {GLYPHS.map((g, i) => (
        <motion.span
          key={g.char}
          className={cn('absolute', g.className)}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={reduced ? { opacity: 1, scale: 1 } : { opacity: 1, scale: 1, y: [0, g.y, 0], rotate: [0, i % 2 ? 6 : -6, 0] }}
          transition={{
            opacity: { delay: 0.6 + i * 0.1 },
            scale: { delay: 0.6 + i * 0.1 },
            y: { duration: g.duration, repeat: Infinity, ease: 'easeInOut' },
            rotate: { duration: g.duration * 1.3, repeat: Infinity, ease: 'easeInOut' },
          }}
        >
          {g.char}
        </motion.span>
      ))}
    </div>
  )
}

/** "a whole book", underlined by a stroke that draws itself in. */
function Underlined({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block whitespace-nowrap text-primary italic">
      {children}
      <svg viewBox="0 0 300 20" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-3 w-full sm:-bottom-3 sm:h-4" aria-hidden>
        <motion.path
          d="M4 14 C 60 4, 120 4, 170 9 S 260 16, 296 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.55 }}
          transition={{ delay: 0.7, duration: 0.9, ease: 'easeInOut' }}
        />
      </svg>
    </span>
  )
}

function TopicBox({ id, className, autoRotate = true }: { id: string; className?: string; autoRotate?: boolean }) {
  const navigate = useNavigate()
  const [topic, setTopic] = useState('')
  const placeholder = useRotating(EXAMPLES, autoRotate && !topic)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        navigate(createUrl(topic.trim()))
      }}
      className={cn(
        'group/box flex items-center gap-2 rounded-2xl border border-border bg-card p-2 pl-4 text-left shadow-[0_24px_60px_-28px_rgb(0_0_0/0.35)] transition-[border-color,box-shadow] duration-300',
        'focus-within:border-primary/50 focus-within:shadow-[0_24px_60px_-28px_var(--primary),0_0_0_4px_color-mix(in_oklab,var(--primary)_14%,transparent)]',
        'max-[359px]:flex-wrap max-[359px]:p-2',
        className,
      )}
    >
      <Sparkles className="size-5 shrink-0 text-primary transition-transform duration-500 group-focus-within/box:rotate-90 max-[359px]:hidden" />
      <label htmlFor={id} className="sr-only">
        What should your book be about?
      </label>
      <input
        id={id}
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        maxLength={500}
        placeholder={placeholder}
        autoComplete="off"
        size={1}
        className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-muted-foreground/70 sm:text-lg"
      />
      <Button type="submit" variant="brand" size="lg" className="shrink-0 rounded-xl max-[359px]:w-full">
        <span className="hidden sm:inline">Start writing</span>
        <span className="sm:hidden">Start</span>
        <ArrowRight data-nudge />
      </Button>
    </form>
  )
}

function Prologue() {
  const hasBooks = useLiveQuery(async () => (await db.books.count()) > 0, [])
  const rise = (delay: number) =>
    ({ initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { delay, type: 'spring', stiffness: 120, damping: 20 } }) as const
  return (
    <section className="relative isolate grid grid-cols-1 gap-14 pt-10 sm:pt-16">
      <FloatingGlyphs />
      <div className="mx-auto grid max-w-3xl justify-items-center px-2 text-center">
        <motion.div {...rise(0)}>
          <Link
            to="/#privacy"
            className="group inline-flex items-center gap-2 rounded-full border border-border bg-card/70 py-1 pr-1 pl-3.5 text-sm text-muted-foreground backdrop-blur transition-colors hover:border-primary/40 hover:text-foreground max-sm:text-xs"
          >
            <span className="size-1.5 animate-pulse-soft rounded-full bg-primary" />
            Open source · Bring your own key · Self-hostable
            <span className="grid size-6 place-items-center rounded-full bg-primary/10 text-primary transition-transform group-hover:translate-x-0.5">
              <ArrowRight className="size-3.5" />
            </span>
          </Link>
        </motion.div>
        <motion.h1 {...rise(0.08)} className="mt-8 font-serif text-[2.6rem] leading-[1.05] font-medium tracking-[-0.03em] text-balance sm:text-6xl lg:text-7xl">
          Turn one idea into <Underlined>a whole book</Underlined>
        </motion.h1>
        <motion.p {...rise(0.16)} className="mt-7 max-w-xl text-base leading-relaxed text-balance text-muted-foreground sm:text-lg">
          Pick a topic and the AI model you like. Infinite Bookshelf plans the chapters, then writes them live, page by page, while you watch.
        </motion.p>
        <motion.div {...rise(0.24)} className="mt-9 w-full max-w-2xl">
          <TopicBox id="hero-topic" />
          <p className="mt-3 text-xs text-muted-foreground">
            Or pick a book off the shelf below.
            {hasBooks && (
              <>
                {' '}
                Already writing?{' '}
                <Link to="/books" className="font-medium text-foreground underline decoration-primary/50 underline-offset-4 hover:decoration-primary">
                  Open your books
                </Link>
              </>
            )}
          </p>
        </motion.div>
      </div>
      <Shelf className="-mx-3 sm:-mx-4" />
    </section>
  )
}

// ---- Chapter II: models -------------------------------------------------------------------------

const MIX = [
  { step: 'Outline', provider: 'openai', model: 'gpt-6.1-sol' },
  { step: 'Chapters', provider: 'anthropic', model: 'claude-opus-5-5' },
  { step: 'Title', provider: 'gemini', model: 'gemini-3.5-flash-lite' },
]

function Models() {
  return (
    <section className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
      <div className="grid gap-6">
        <ChapterHeading
          label="Chapter II"
          center={false}
          title="Write with the models you already pay for"
          text="Sixteen providers built in, plus any OpenAI-compatible API or a model on your own machine. Mix them: a fast one for the outline, your strongest for the chapters."
        />
        <motion.ul {...reveal} className="grid gap-2 rounded-2xl border border-border bg-card p-3">
          {MIX.map((m, i) => (
            <motion.li
              key={m.step}
              initial={{ opacity: 0, x: -12 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 + i * 0.12 }}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-muted"
            >
              <span className="w-20 font-serif text-sm text-muted-foreground italic">{m.step}</span>
              <ProviderIcon id={m.provider} className="text-lg" />
              <span className="truncate font-mono text-sm">{m.model}</span>
            </motion.li>
          ))}
        </motion.ul>
        <p className="text-xs leading-relaxed text-muted-foreground">Works with {PROVIDERS.map((p) => p.name).join(', ')}, and any OpenAI-compatible API.</p>
      </div>
      <ModelOrbit />
    </section>
  )
}

// ---- Chapter III: privacy -----------------------------------------------------------------------

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

function Station({ icon: Icon, title, text, children, index }: { icon: typeof Monitor; title: string; text: string; children?: ReactNode; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ delay: index * 0.15 }}
      className="relative grid content-start gap-2 rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex items-center gap-3">
        <span className="relative grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-4.5" />
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/10 [animation-duration:3s]" />
        </span>
        <h3 className="font-medium">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
      {children}
    </motion.div>
  )
}

function Privacy() {
  return (
    <section id="privacy" className="grid scroll-mt-24 gap-12">
      <ChapterHeading
        label="Chapter III"
        title="Your keys and books stay in your hands"
        text="No accounts and no database. Here's exactly where your data goes."
      />
      <div className="grid md:grid-cols-[1fr_9rem_1fr_9rem_1fr] md:items-stretch">
        <Station index={0} icon={Monitor} title="Your browser" text="Keeps your API keys and every book you write. Nothing is uploaded to an account." />
        <Connector label="request + key" />
        <Station index={1} icon={Server} title="This app's server" text="Uses your key for one request, streams the answer back, and forgets it." />
        <Connector label="your prompt" delay={1.2} />
        <Station index={2} icon={Sparkles} title="Your AI provider" text="The provider you chose, billed to your own account. Or a local model.">
          <div className="mt-1 flex gap-2 text-lg">
            {['openai', 'anthropic', 'gemini', 'deepseek', 'ollama'].map((id) => (
              <ProviderIcon key={id} id={id} />
            ))}
          </div>
        </Station>
      </div>
      <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {FACTS.map((fact, i) => (
          <motion.div key={fact.title} {...reveal} transition={{ ...reveal.transition, delay: i * 0.06 }} className="flex gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border bg-card text-primary">
              <fact.icon className="size-4.5" />
            </span>
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

// ---- Chapter IV: self-hosting -------------------------------------------------------------------

function SelfHost() {
  return (
    <section id="self-host" className="grid scroll-mt-24 items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
      <div className="grid gap-6">
        <ChapterHeading
          label="Chapter IV"
          center={false}
          title="Run your own copy in a minute"
          text="Self-hosting means your keys only pass through a server you control, and lets you write with local models like Ollama or LM Studio. One Docker image, no database to set up."
        />
        <motion.div {...reveal} className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`${REPO_URL}/blob/main/docs/self-hosting.md`} target="_blank" rel="noreferrer">
              <FolderGit2 /> Self-hosting guide
            </a>
          </Button>
          <Button asChild variant="ghost">
            <a href={apiUrl('/api/docs')} target="_blank" rel="noreferrer">
              <Braces /> API docs
            </a>
          </Button>
        </motion.div>
      </div>
      <motion.div {...reveal}>
        <TypingTerminal lines={[`git clone ${REPO_URL}`, 'cd infinite-bookshelf', 'docker compose up -d']} note="Open http://localhost:9752" />
      </motion.div>
    </section>
  )
}

// ---- Appendix: questions ------------------------------------------------------------------------

const FAQ = [
  {
    q: 'Is it free?',
    a: 'The app is free and open source. You pay your AI provider for what you use, and many have free tiers. Local models through Ollama or LM Studio cost nothing.',
  },
  {
    q: 'Which models can I use?',
    a: 'OpenAI, Anthropic Claude, Google Gemini, xAI Grok, DeepSeek, Mistral, Kimi, Qwen, GLM, and more through OpenRouter, Groq, Together, Fireworks, and Cerebras, or any OpenAI-compatible API, including local servers like Ollama and LM Studio when you run your own copy. You can pick a different model for the outline, the title, and the chapters, switch models between chapters, and add several keys per provider.',
  },
  {
    q: 'Where are my books saved?',
    a: "In this browser's database. There are no accounts, so nothing is uploaded. Export a backup from Settings to keep a copy or move your books to another device.",
  },
  {
    q: 'Can I change what the AI writes?',
    a: 'Yes. Review and reorder the outline before writing starts, write one chapter at a time so you can read each before the next, and rewrite any section with a note like “add a worked example”.',
  },
  {
    q: 'How long does a book take?',
    a: 'A short book with a fast model takes a few minutes; longer sections and larger models take longer. You can pause at any point and carry on later.',
  },
]

function Question({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-border">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="group flex w-full items-center gap-4 py-5 text-left">
        <span className="font-serif text-lg transition-colors group-hover:text-primary">{q}</span>
        <span
          className={cn(
            'ml-auto grid size-8 shrink-0 place-items-center rounded-full border transition-colors',
            open ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground',
          )}
        >
          {open ? <Minus className="size-4" /> : <Plus className="size-4" />}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="pr-12 pb-5 leading-relaxed text-muted-foreground">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Questions() {
  return (
    <section className="grid gap-10">
      <ChapterHeading label="Appendix" title="Good to know" />
      <motion.div {...reveal} className="mx-auto w-full max-w-3xl border-t border-border">
        {FAQ.map((item) => (
          <Question key={item.q} {...item} />
        ))}
      </motion.div>
    </section>
  )
}

// ---- Epilogue -----------------------------------------------------------------------------------

function Epilogue() {
  return (
    <motion.section {...reveal} className="glow-border rounded-4xl bg-card">
      <div className="relative isolate grid justify-items-center gap-6 overflow-hidden rounded-4xl px-6 py-16 text-center sm:py-20">
        <div className="absolute -top-24 left-1/2 -z-10 size-96 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_18%,transparent),transparent)]" />
        <motion.div
          initial={{ rotate: -8, scale: 0.8, opacity: 0 }}
          whileInView={{ rotate: 0, scale: 1, opacity: 1 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 160, damping: 12, delay: 0.1 }}
          className="grid size-20 place-items-center rounded-3xl border border-border bg-background shadow-[0_16px_40px_-18px_var(--primary)]"
        >
          <LogoMark animated live className="w-14" />
        </motion.div>
        <p className="font-serif text-sm text-primary italic">Epilogue</p>
        <h2 className="max-w-2xl font-serif text-3xl leading-tight font-medium tracking-[-0.02em] text-balance sm:text-5xl">Your next book is one idea away</h2>
        <p className="max-w-md text-balance text-muted-foreground">Bring a topic and a key. The first chapter starts in under a minute.</p>
        <TopicBox id="closing-topic" autoRotate={false} className="w-full max-w-xl" />
      </div>
    </motion.section>
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
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-28 px-3 pb-24 sm:gap-36 sm:px-4">
      <ReadingRibbon />
      <div className="grid grid-cols-1 gap-16 sm:gap-20">
        <Prologue />
        <div className="mx-auto w-full max-w-5xl px-1 sm:px-4">
          <OpenBookDemo />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-28 px-1 sm:gap-36 sm:px-6">
        <section className="grid gap-12">
          <ChapterHeading
            label="Chapter I"
            title="From one idea to a finished book"
            text="You stay in charge of the shape of the book. The model does the writing."
          />
          <Steps />
        </section>
        <Models />
        <Privacy />
        <SelfHost />
        <Questions />
        <Epilogue />
        <p className="-mt-16 text-center text-xs leading-relaxed text-muted-foreground">
          Inspired by the original Infinite Bookshelf by Benjamin Klieger · MIT licence
          <br />
          Provider names and logos are trademarks of their owners, shown only to indicate compatibility. Icons by LobeHub (MIT).
        </p>
      </div>
    </div>
  )
}
