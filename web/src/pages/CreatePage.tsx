import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, FileUp, KeyRound, SlidersHorizontal, Sparkles, Wand2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/BookCard'
import { ModelSelect } from '@/components/ModelSelect'
import { Button } from '@/components/ui/button'
import { Field, Hint, Label, NativeSelect, Segmented, Switch, Textarea } from '@/components/ui/fields'
import { Kbd, ProgressBar } from '@/components/ui/misc'
import { createBook } from '@/lib/create-book'
import { db } from '@/lib/db'
import { bookProgress } from '@/lib/outline'
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

function Composer({ initialTopic }: { initialTopic: string }) {
  const navigate = useNavigate()
  const prefs = usePreferences()
  const config = useServer((s) => s.config)
  const providers = useProviderList()
  const options = useMemo(() => modelOptions(providers), [providers])

  const [topic, setTopic] = useState(initialTopic)
  const [instructions, setInstructions] = useState('')
  const [style, setStyle] = useState('')
  const [complexity, setComplexity] = useState('')
  const [longOutline, setLongOutline] = useState(false)
  const [seedContent, setSeedContent] = useState('')
  const [sectionLength, setSectionLength] = useState<SectionLength>(prefs.sectionLength)
  const [reviewOutline, setReviewOutline] = useState(prefs.reviewOutline)
  const [chapterByChapter, setChapterByChapter] = useState(prefs.chapterByChapter)
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
        chapterByChapter,
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
                <button key={example} type="button" onClick={() => setTopic(example)} className="rounded-full border border-border bg-card px-3 py-1 text-left text-xs text-muted-foreground transition-all hover:-translate-y-px hover:border-primary/50 hover:text-foreground pointer-coarse:px-3.5 pointer-coarse:py-3">
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
                  <ModelSelect id={`model-${step}`} step={step} value={resolved[step]} options={options} onChange={(ref) => ref && setModels((m) => ({ ...m, [step]: ref }))} />
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
              <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                <Switch checked={chapterByChapter} onCheckedChange={setChapterByChapter} /> One chapter at a time
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
                      <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg text-xs font-medium text-primary hover:underline pointer-coarse:-my-2 pointer-coarse:px-2 pointer-coarse:py-2.5">
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
            {chapterByChapter && ' Each chapter waits for you to read it before the next.'}
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

/** A compact strip of the latest books, so returning writers can jump back in. */
function ContinueStrip() {
  const books = useLiveQuery(() => db.books.orderBy('updatedAt').reverse().limit(3).toArray(), [])
  if (!books?.length) return null
  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Continue where you left off</h2>
        <Link to="/books" className="inline-flex items-center gap-1 rounded-lg text-sm font-medium text-primary hover:underline pointer-coarse:-my-2.5 pointer-coarse:px-2 pointer-coarse:py-2.5">
          All books <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {books.map((book, i) => {
          const { total, ratio } = bookProgress(book)
          return (
            <motion.div key={book.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.05 }}>
              <Link to={`/books/${book.id}`} className="surface spotlight group flex items-center gap-3 p-3 transition-colors hover:border-primary/40">
                <span aria-hidden className="grid h-12 w-9 shrink-0 place-items-center rounded-[5px] bg-[linear-gradient(160deg,var(--hero-from),var(--hero-to))] font-display text-sm font-medium text-white shadow-sm transition-transform group-hover:-rotate-3">
                  {(book.title || book.options.topic).trim().charAt(0).toUpperCase()}
                </span>
                <div className="grid min-w-0 flex-1 gap-1.5">
                  <p className="truncate text-sm font-medium">{book.title || book.options.topic}</p>
                  {total > 0 ? <ProgressBar value={ratio} /> : <StatusBadge book={book} />}
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}

export function CreatePage() {
  // The landing page's topic box hands its text over as ?topic=
  const [params] = useSearchParams()
  const initialTopic = (params.get('topic') ?? '').slice(0, 500)

  return (
    <div className="mx-auto grid max-w-4xl grid-cols-1 gap-10 px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid gap-2">
        <p className="eyebrow">New book</p>
        <h1 className="text-3xl font-medium tracking-tight [text-wrap:balance] sm:text-4xl">What will you write today?</h1>
        <p className="max-w-2xl text-muted-foreground">
          Describe a topic and pick a model. You'll get an outline to review, then every chapter is written live.
        </p>
      </motion.div>
      <Composer initialTopic={initialTopic} />
      <ContinueStrip />
    </div>
  )
}
