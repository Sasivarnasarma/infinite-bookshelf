import { useLiveQuery } from 'dexie-react-hooks'
import { Database, Download, KeyRound, Monitor, Moon, Palette, ShieldCheck, SlidersHorizontal, Sun, Trash2, Upload } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useRef, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { Markdown } from '@/components/Markdown'
import { ProvidersWorkspace } from '@/components/settings/ProvidersWorkspace'
import { Button } from '@/components/ui/button'
import { Field, Hint, Segmented, Switch } from '@/components/ui/fields'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/overlays'
import { db } from '@/lib/db'
import { downloadBackup, importBackup } from '@/lib/export'
import { useKeys, usePreferences, useServer, type ReadingSize, type Theme } from '@/lib/settings'
import type { SectionLength } from '@/lib/types'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'providers', label: 'Providers & models', icon: KeyRound },
  { id: 'writing', label: 'Writing', icon: SlidersHorizontal },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'data', label: 'Your data', icon: Database },
] as const
type TabId = (typeof TABS)[number]['id']

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-4">
      <div>
        <h2 className="font-display text-xl font-medium">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function ProvidersTab() {
  const remember = usePreferences((s) => s.rememberKeys)
  const setPrefs = usePreferences((s) => s.set)

  return (
    <div className="grid grid-cols-1 gap-10">
      <ProvidersWorkspace />
      <div className="surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <ShieldCheck className="size-8 shrink-0 text-success" />
        <div className="grid grid-cols-1 gap-1 text-sm">
          <p className="font-medium">Your keys stay with you</p>
          <p className="text-muted-foreground">
            Keys are saved only in this browser and sent to this app's server with each request, where they're used and immediately forgotten.{' '}
            <Link to="/#privacy" className="text-primary hover:underline">
              How it works
            </Link>
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2.5 text-sm sm:ml-auto">
          <Switch checked={remember} onCheckedChange={(rememberKeys) => setPrefs({ rememberKeys })} />
          Remember my keys
        </label>
      </div>
      {!remember && <Hint className="-mt-8">Keys are kept only until you close this tab.</Hint>}
    </div>
  )
}

function WritingTab() {
  const prefs = usePreferences()
  const config = useServer((s) => s.config)

  return (
    <div className="grid grid-cols-1 gap-10">
      <Section title="Writing" description="How new books are written. You can still change these per book.">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <Field label="Section length" hint={`About ${config?.section_lengths[prefs.sectionLength] ?? '…'} words per section.`}>
            <Segmented<SectionLength>
              value={prefs.sectionLength}
              onChange={(sectionLength) => prefs.set({ sectionLength })}
              options={(['short', 'medium', 'long'] as SectionLength[]).map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))}
            />
          </Field>
          <Field label="Delay between sections" hint="A pause between requests helps stay under free-tier rate limits.">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={10}
                step={0.5}
                value={prefs.delaySeconds}
                onChange={(e) => prefs.set({ delaySeconds: Number(e.target.value) })}
                className="h-6 w-full accent-primary pointer-coarse:h-11"
                aria-label="Delay between sections"
              />
              <span className="w-12 text-right font-mono text-sm tabular-nums">{prefs.delaySeconds.toFixed(1)}s</span>
            </div>
          </Field>
        </div>
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <Switch checked={prefs.reviewOutline} onCheckedChange={(reviewOutline) => prefs.set({ reviewOutline })} />
          Review the outline before writing starts
        </label>
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <Switch checked={prefs.chapterByChapter} onCheckedChange={(chapterByChapter) => prefs.set({ chapterByChapter })} />
          Write one chapter at a time, so you can read each before the next
        </label>
      </Section>
    </div>
  )
}

const SAMPLE = `Every discipline begins with a handful of ideas that everything else rests on. **Clarity** keeps decisions explainable, and a good mental model makes the later chapters easier.

> The best time to test an assumption is before you build on top of it.`

function AppearanceTab() {
  const prefs = usePreferences()
  return (
    <div className="grid grid-cols-1 gap-10">
      <Section title="Theme">
        <Segmented<Theme>
          value={prefs.theme}
          onChange={(theme) => prefs.set({ theme })}
          className="w-fit"
          options={[
            {
              value: 'system',
              label: (
                <span className="flex items-center gap-1.5">
                  <Monitor className="size-3.5" /> System
                </span>
              ),
            },
            {
              value: 'light',
              label: (
                <span className="flex items-center gap-1.5">
                  <Sun className="size-3.5" /> Light
                </span>
              ),
            },
            {
              value: 'dark',
              label: (
                <span className="flex items-center gap-1.5">
                  <Moon className="size-3.5" /> Dark
                </span>
              ),
            },
          ]}
        />
      </Section>
      <Section title="Reading size" description="Text size in the book reader.">
        <Segmented<ReadingSize>
          value={prefs.readingSize}
          onChange={(readingSize) => prefs.set({ readingSize })}
          className="w-fit"
          options={[
            { value: 'sm', label: 'Small' },
            { value: 'md', label: 'Medium' },
            { value: 'lg', label: 'Large' },
          ]}
        />
        <div className="surface p-6">
          <Markdown text={SAMPLE} className={cn({ sm: 'prose-base', md: 'prose-lg', lg: 'prose-xl' }[prefs.readingSize])} />
        </div>
      </Section>
    </div>
  )
}

function DataTab() {
  const books = useLiveQuery(() => db.books.toArray(), []) ?? []
  const clearKeys = useKeys((s) => s.clear)
  const fileInput = useRef<HTMLInputElement>(null)

  return (
    <div className="grid grid-cols-1 gap-10">
      <Section title="Backups" description="Books are stored only in this browser. Back them up to keep them safe or move them to another device.">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!books.length} onClick={() => downloadBackup(books)}>
            <Download /> Back up {books.length} book{books.length === 1 ? '' : 's'}
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (!file) return
              importBackup(file)
                .then((n) => toast.success(`Imported ${n} book${n === 1 ? '' : 's'}`))
                .catch((err) => toast.error('Import failed', { description: err.message }))
            }}
          />
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            <Upload /> Import a backup
          </Button>
        </div>
      </Section>
      <Section title="Clear data" description="These can't be undone.">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              clearKeys()
              toast.success('API keys removed from this browser')
            }}
          >
            <KeyRound /> Forget my API keys
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="text-danger" disabled={!books.length}>
                <Trash2 /> Delete all books
              </Button>
            </DialogTrigger>
            <DialogContent
              title="Delete all books?"
              description={`All ${books.length} books will be removed from this browser. Back them up first if you want to keep them.`}
            >
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      await db.books.clear()
                      toast.success('All books deleted')
                    }}
                  >
                    <Trash2 /> Delete everything
                  </Button>
                </DialogClose>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </Section>
    </div>
  )
}

export function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'providers') as TabId

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 pt-10 pb-24 sm:px-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight sm:text-4xl">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Saved in this browser.</p>
      </div>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[14rem_1fr]">
        <nav className="grid grid-cols-2 gap-1 sm:flex lg:sticky lg:top-24 lg:flex-col lg:self-start" aria-label="Settings sections">
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setParams({ tab: t.id }, { replace: true })} className="relative shrink-0">
              {tab === t.id && (
                <motion.span
                  layoutId="settings-tab"
                  className="absolute inset-0 rounded-xl bg-muted ring-1 ring-border"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span
                className={cn(
                  'relative flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium max-sm:px-3',
                  tab === t.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <t.icon className="size-4" /> {t.label}
              </span>
            </button>
          ))}
        </nav>
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="min-w-0"
          >
            {tab === 'providers' && <ProvidersTab />}
            {tab === 'writing' && <WritingTab />}
            {tab === 'appearance' && <AppearanceTab />}
            {tab === 'data' && <DataTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
