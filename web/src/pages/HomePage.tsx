import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Download, FileUp, KeyRound, ListTree, PenLine, SlidersHorizontal, Sparkles, Wand2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { BookCard } from '@/components/BookCard'
import { DotWave } from '@/components/DotWave'
import { ProviderIcon } from '@/components/ProviderIcon'
import { ModelSelect } from '@/components/ModelSelect'
import { Button } from '@/components/ui/button'
import { Field, Hint, Label, NativeSelect, Segmented, Switch, Textarea } from '@/components/ui/fields'
import { Kbd } from '@/components/ui/misc'
import { createBook } from '@/lib/create-book'
import { db } from '@/lib/db'
import { modelOptions, sameRef, useProviderList, usePreferences, useServer } from '@/lib/settings'
import type { ModelRef, SectionLength, Step } from '@/lib/types'
import { cn } from '@/lib/utils'

const EXAMPLES = [
  'Quantum computing for curious beginners',
  'A practical guide to growing vegetables on a balcony',
  'The history of mathematics, told through its big ideas',
  'Personal finance for people who hate spreadsheets',
  'Designing great APIs: a field guide for developers',
  'Stoicism for modern life',
]

const STYLES = ['', 'Casual', 'Formal', 'Academic', 'Creative', 'Technical', 'Storytelling']
const DEPTHS = ['', 'Beginner', 'Intermediate', 'Advanced', 'Expert']
const STEP_LABELS: Record<Step, string> = { outline: 'Outline', title: 'Title', section: 'Chapters' }

function useRotatingPlaceholder(active: boolean) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setIndex((i) => (i + 1) % EXAMPLES.length), 3200)
    return () => clearInterval(timer)
  }, [active])
  return EXAMPLES[index]
}

function Composer() {
  const navigate = useNavigate()
  const prefs = usePreferences()
  const config = useServer((s) => s.config)
  const providers = useProviderList()
  const options = useMemo(() => modelOptions(providers), [providers])

  const [topic, setTopic] = useState('')
  const [instructions, setInstructions] = useState('')
  const [style, setStyle] = useState('')
  const [complexity, setComplexity] = useState('')
  const [longOutline, setLongOutline] = useState(false)
  const [seedContent, setSeedContent] = useState('')
  const [sectionLength, setSectionLength] = useState<SectionLength>(prefs.sectionLength)
  const [reviewOutline, setReviewOutline] = useState(prefs.reviewOutline)
  const [advanced, setAdvanced] = useState(false)
  const [perStep, setPerStep] = useState(false)
  const [models, setModels] = useState<Partial<Record<Step, ModelRef>>>({})
  const [busy, setBusy] = useState(false)
  const placeholder = useRotatingPlaceholder(!topic)
  const fileInput = useRef<HTMLInputElement>(null)

  // Pick each step's model: what's chosen here, else the saved default, else the first available
  const resolved = useMemo(() => {
    const pick = (step: Step): ModelRef | null => {
      const candidates = [models[step], perStep ? undefined : models.section, prefs.defaultModels[step], prefs.defaultModels.section]
      for (const ref of candidates) if (ref && options.some((o) => sameRef(o, ref))) return ref
      const preferred = providers.find((p) => p.status === 'ready' && p.models.includes(p.defaultModel))
      return preferred ? { providerId: preferred.id, model: preferred.defaultModel } : (options[0] ?? null)
    }
    return { outline: pick('outline'), title: pick('title'), section: pick('section') }
  }, [models, perStep, prefs.defaultModels, options, providers])

  const advancedCount = [style, complexity, longOutline, seedContent.trim(), instructions.trim()].filter(Boolean).length
  const noModels = config !== null && options.length === 0
  const canSubmit = topic.trim().length >= 3 && resolved.section && resolved.outline && resolved.title && !busy

  async function submit() {
    if (!canSubmit || !resolved.section || !resolved.outline || !resolved.title) return
    setBusy(true)
    try {
      const section = resolved.section
      const id = await createBook(
        { topic: topic.trim(), instructions: instructions.trim(), style, complexity, seedContent: seedContent.trim(), longOutline, sectionLength },
        perStep ? { outline: resolved.outline, title: resolved.title, section } : { outline: section, title: section, section },
        reviewOutline,
      )
      navigate(`/books/${id}`)
    } catch (e) {
      toast.error('Could not start the book', { description: String(e) })
      setBusy(false)
    }
  }

  async function loadFile(file: File) {
    const max = config?.max_seed_chars ?? 20000
    const text = (await file.text()).trim()
    setSeedContent((s) => `${s}\n\n${text}`.trim().slice(0, max))
    if (text.length > max) toast.warning(`Only the first ${max.toLocaleString()} characters were kept.`)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, type: 'spring', stiffness: 160, damping: 22 }} className="surface spotlight relative overflow-hidden p-2 shadow-[0_30px_80px_-30px_rgb(0_0_0/0.35)]">
      <div className="bg-brand absolute inset-x-0 top-0 h-[3px]" />
      <div className="rounded-[0.9rem] bg-muted/40 p-4 sm:p-5">
        <label htmlFor="topic" className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4 text-primary" /> What should your book be about?
        </label>
        <textarea
          id="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit()
          }}
          rows={2}
          maxLength={500}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent font-display text-xl font-medium leading-snug tracking-tight outline-none placeholder:text-muted-foreground/40 sm:text-[26px]"
        />
        <AnimatePresence>
          {!topic && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.slice(0, 4).map((example) => (
                <button key={example} type="button" onClick={() => setTopic(example)} className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-all hover:-translate-y-px hover:border-primary/50 hover:text-foreground">
                  {example}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="grid gap-4 p-4 sm:p-5">
        {noModels ? (
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-primary/40 bg-accent/40 p-4 sm:flex-row sm:items-center">
            <KeyRound className="size-5 shrink-0 text-primary" />
            <div className="grid gap-0.5">
              <p className="text-sm font-medium">Add an API key to start writing</p>
              <p className="text-xs text-muted-foreground">Bring your own key from Gemini, OpenAI, OpenRouter and more. It's saved only in this browser.</p>
            </div>
            <Button asChild size="sm" className="sm:ml-auto">
              <Link to="/settings">
                Set up a provider <ArrowRight />
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className={cn('grid gap-3', perStep ? 'sm:grid-cols-3' : 'sm:grid-cols-[1fr_auto]')}>
              {(perStep ? (['outline', 'title', 'section'] as Step[]) : (['section'] as Step[])).map((step) => (
                <Field key={step} label={perStep ? `${STEP_LABELS[step]} model` : 'Model'} htmlFor={`model-${step}`}>
                  <ModelSelect id={`model-${step}`} value={resolved[step]} options={options} onChange={(ref) => setModels((m) => ({ ...m, [step]: ref }))} />
                </Field>
              ))}
              {!perStep && (
                <Field label="Section length">
                  <Segmented<SectionLength>
                    value={sectionLength}
                    onChange={setSectionLength}
                    options={(['short', 'medium', 'long'] as SectionLength[]).map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1), hint: `About ${config?.section_lengths[v] ?? ''} words per section` }))}
                  />
                </Field>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                <Switch checked={perStep} onCheckedChange={setPerStep} /> Different model per step
              </label>
              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                <Switch checked={reviewOutline} onCheckedChange={setReviewOutline} /> Review outline first
              </label>
              {perStep && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Length</span>
                  <Segmented<SectionLength> size="sm" value={sectionLength} onChange={setSectionLength} options={(['short', 'medium', 'long'] as SectionLength[]).map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-border/80">
          <button type="button" onClick={() => setAdvanced((a) => !a)} className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium" aria-expanded={advanced}>
            <SlidersHorizontal className="size-4 text-muted-foreground" />
            Advanced options
            {advancedCount > 0 && <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">{advancedCount} set</span>}
            <motion.span animate={{ rotate: advanced ? 90 : 0 }} className="ml-auto text-muted-foreground">
              <ArrowRight className="size-4" />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {advanced && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                <div className="grid gap-4 border-t border-border/80 p-4">
                  <Field label="Guidelines" hint="Tone, audience, focus areas, things to include or avoid." htmlFor="guidelines">
                    <Textarea id="guidelines" value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={5000} placeholder="e.g. Practical and friendly. Include a worked example in every chapter." />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Writing style" htmlFor="style">
                      <NativeSelect id="style" value={style} onChange={(e) => setStyle(e.target.value)}>
                        {STYLES.map((s) => (
                          <option key={s} value={s}>
                            {s || 'Default'}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label="Depth" htmlFor="depth">
                      <NativeSelect id="depth" value={complexity} onChange={(e) => setComplexity(e.target.value)}>
                        {DEPTHS.map((d) => (
                          <option key={d} value={d}>
                            {d || 'Default'}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Field label="Outline detail">
                      <Segmented<'standard' | 'in-depth'> value={longOutline ? 'in-depth' : 'standard'} onChange={(v) => setLongOutline(v === 'in-depth')} options={[{ value: 'standard', label: 'Standard' }, { value: 'in-depth', label: 'In-depth' }]} />
                    </Field>
                  </div>
                  <div className="grid gap-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="seed">Your notes (optional)</Label>
                      <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                        <FileUp className="size-3.5" /> Add from a .txt or .md file
                      </button>
                      <input ref={fileInput} type="file" accept=".txt,.md,text/plain,text/markdown" hidden onChange={(e) => e.target.files?.[0] && void loadFile(e.target.files[0])} />
                    </div>
                    <Textarea id="seed" value={seedContent} onChange={(e) => setSeedContent(e.target.value)} maxLength={config?.max_seed_chars ?? 20000} className="min-h-28" placeholder="Paste notes, an outline, or facts the book should build on." />
                    <Hint>Sent with every request, so long notes use more tokens.</Hint>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground sm:mr-auto">
            {reviewOutline ? "You'll review the outline before any chapter is written." : 'Writing starts as soon as the outline is ready.'}
            <span className="ml-2 hidden sm:inline">
              <Kbd>Ctrl</Kbd> + <Kbd>Enter</Kbd>
            </span>
          </p>
          <Button variant="brand" size="lg" disabled={!canSubmit} onClick={() => void submit()} className="sm:min-w-48">
            <Wand2 /> {busy ? 'Starting…' : 'Write my book'} <ArrowRight data-nudge />
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

function RecentBooks() {
  const books = useLiveQuery(() => db.books.orderBy('updatedAt').reverse().limit(4).toArray(), [])
  if (!books?.length) return null
  return (
    <section className="grid gap-5">
      <div className="flex items-end justify-between">
        <h2 className="font-display text-2xl font-medium">Continue where you left off</h2>
        <Link to="/books" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          All books <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {books.map((book, i) => (
          <BookCard key={book.id} book={book} index={i} />
        ))}
      </div>
    </section>
  )
}

const PROVIDERS = [
  { id: 'gemini', name: 'Google Gemini' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'groq', name: 'Groq' },
  { id: 'ollama', name: 'Ollama' },
  { id: 'lmstudio', name: 'LM Studio' },
  { id: 'vllm', name: 'vLLM' },
  { id: 'together', name: 'Together AI' },
  { id: 'fireworks', name: 'Fireworks AI' },
  { id: 'custom', name: 'Any OpenAI-compatible API' },
]

/** Endless scrolling strip of the providers it works with. */
function ProviderMarquee() {
  const items = [...PROVIDERS, ...PROVIDERS]
  return (
    <section className="grid gap-4">
      <p className="eyebrow text-center">Bring your own model</p>
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

const STEPS = [
  { icon: ListTree, title: 'Outline', text: 'Your model drafts a table of contents and a title. Rename, reorder, and approve it before anything is written.' },
  { icon: PenLine, title: 'Write', text: 'Every section streams in live, word by word, and builds on the ones before it. Pause any time.' },
  { icon: Download, title: 'Export', text: 'Rewrite any section with a note, then export Markdown, PDF, or a JSON backup.' },
]

const FEATURES = [
  { icon: KeyRound, title: 'Your keys stay with you', text: 'Saved only in your browser. Sent with each request, never stored on the server.' },
  { icon: Sparkles, title: 'Mix and match models', text: 'Use a fast model for the outline and a stronger one for chapters, across providers.' },
  { icon: Wand2, title: 'Open source', text: 'Read every line, run your own copy, and use local models like Ollama.' },
]

function Grid({ eyebrow, title, items }: { eyebrow: string; title: string; items: { icon: typeof ListTree; title: string; text: string }[] }) {
  return (
    <section className="grid gap-8">
      <div className="grid justify-items-center gap-2 text-center">
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="max-w-xl text-3xl font-medium [text-wrap:balance] sm:text-4xl">{title}</h2>
      </div>
      <div className="frame-corners grid border-y border-border md:grid-cols-3">
        {items.map((item, i) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ delay: i * 0.08 }}
            className={cn('spotlight group grid content-start gap-3 p-7', i > 0 && 'border-t border-border md:border-l md:border-t-0')}
          >
            <div className="flex items-center justify-between">
              <item.icon className="size-6 text-foreground transition-colors group-hover:text-primary" strokeWidth={1.6} />
              <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
            </div>
            <h3 className="mt-2 text-lg font-medium">{item.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{item.text}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden rounded-[1.75rem] bg-[linear-gradient(160deg,var(--hero-from),var(--hero-to))] px-6 pb-44 pt-16 text-center text-white sm:pt-24">
      <DotWave className="-z-10 opacity-70" />
      {/* Sunrise glow, gently breathing */}
      <div className="animate-sunrise absolute -bottom-40 left-1/2 -z-10 h-80 w-[46rem] max-w-[140%] rounded-[50%] bg-[radial-gradient(closest-side,#fff7d6,#ffd27a_35%,rgba(255,170,80,0.55)_60%,transparent)] blur-xl" />
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex justify-center">
        <Link to="/about" className="group inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 py-1 pl-4 pr-1 text-sm font-medium backdrop-blur-sm transition-colors hover:bg-white/20">
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
    </section>
  )
}

export function HomePage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-20 px-3 pb-24 pt-3 sm:px-4 sm:pt-4">
      <div className="grid">
        <Hero />
        <div className="relative z-10 mx-auto -mt-32 w-full max-w-4xl px-2 sm:px-6">
          <Composer />
        </div>
      </div>
      <div className="grid gap-20 px-1 sm:px-6">
        <RecentBooks />
        <ProviderMarquee />
        <Grid eyebrow="How it works" title="From one idea to a finished book in three steps" items={STEPS} />
        <Grid eyebrow="Why Infinite Bookshelf" title="Private by design, flexible by default" items={FEATURES} />
      </div>
    </div>
  )
}
