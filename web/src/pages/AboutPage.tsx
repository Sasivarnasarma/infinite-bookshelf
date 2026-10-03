import { Database, FolderGit2, KeyRound, Server, ShieldCheck, Terminal } from 'lucide-react'
import { motion } from 'motion/react'

import { LogoMark } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { useServer } from '@/lib/settings'

const FACTS = [
  {
    icon: KeyRound,
    title: 'Your API keys',
    text: "Saved only in this browser's storage (or just for this tab, if you turn off “Remember my keys”). Each request to write a book carries the key for that provider. The server uses it to call the provider, then forgets it: it's never stored or logged.",
  },
  {
    icon: Database,
    title: 'Your books',
    text: "Stored in this browser's database, not on a server. To write the next section, the app sends the outline and the sections written so far, so the model has context. Back up your books from Settings → Your data.",
  },
  {
    icon: Server,
    title: 'The server',
    text: 'Stateless: it turns each request into calls to the AI provider you chose and streams the result back. It has no database and no accounts. It blocks requests to private network addresses on public instances.',
  },
  {
    icon: ShieldCheck,
    title: 'This page',
    text: 'Loads no third-party scripts, fonts, or trackers, so nothing else can read your keys. Text written by models is displayed without running any HTML it contains.',
  },
]

export function AboutPage() {
  const version = useServer((s) => s.config?.version)
  return (
    <div className="mx-auto grid max-w-3xl gap-12 px-4 pb-24 pt-12 sm:px-6">
      <div className="grid justify-items-center gap-4 text-center">
        <LogoMark animated live className="w-28" />
        <h1 className="font-display text-4xl font-medium tracking-tight">Privacy & how it works</h1>
        <p className="max-w-xl text-muted-foreground">
          Infinite Bookshelf is open source. You bring your own AI keys, and you can run your own copy. Here's exactly what happens to your data.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {FACTS.map((f, i) => (
          <motion.div key={f.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="surface p-5">
            <f.icon className="mb-3 size-6 text-primary" />
            <h2 className="font-display text-lg font-medium">{f.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
          </motion.div>
        ))}
      </div>

      <div className="surface grid gap-4 p-6">
        <div className="flex items-center gap-3">
          <Terminal className="size-5 text-primary" />
          <h2 className="font-display text-xl font-medium">Run your own copy</h2>
        </div>
        <p className="text-sm text-muted-foreground">Self-hosting means your keys only pass through a server you control, and lets you use local models like Ollama or LM Studio.</p>
        <pre className="overflow-x-auto rounded-xl bg-muted p-4 font-mono text-[13px] leading-relaxed">
          docker run -p 8000:8000 -e IB_ALLOW_PRIVATE_ENDPOINTS=true ghcr.io/sasivarnasarma/infinite-bookshelf
        </pre>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href="https://github.com/Sasivarnasarma/infinite-bookshelf" target="_blank" rel="noreferrer">
              <FolderGit2 /> Source code & self-hosting guide
            </a>
          </Button>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Inspired by the original Infinite Bookshelf by Benjamin Klieger · MIT licence {version && `· v${version}`}
        <br />
        Provider names and logos are trademarks of their owners, shown only to indicate compatibility. Icons by LobeHub (MIT).
      </p>
    </div>
  )
}
