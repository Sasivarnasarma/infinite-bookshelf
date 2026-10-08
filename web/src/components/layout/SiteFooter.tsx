import { ArrowUpRight, Heart } from 'lucide-react'
import { Link } from 'react-router'

import { Wordmark } from '@/components/Logo'
import { apiUrl } from '@/lib/api-url'
import { useServer } from '@/lib/settings'

const REPO_URL = 'https://github.com/Sasivarnasarma/infinite-bookshelf'

type FooterLink = { label: string; to: string } | { label: string; href: string }

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'App',
    links: [
      { label: 'Write', to: '/new' },
      { label: 'My books', to: '/books' },
      { label: 'Settings', to: '/settings' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { label: 'Privacy', to: '/#privacy' },
      { label: 'Self-host', to: '/#self-host' },
      { label: 'API docs', href: apiUrl('/api/docs') },
    ],
  },
  {
    title: 'Project',
    links: [
      { label: 'Source', href: REPO_URL },
      { label: 'Releases', href: `${REPO_URL}/releases` },
      { label: 'Issues', href: `${REPO_URL}/issues` },
    ],
  },
]

const linkClass = 'group inline-flex items-center gap-1 rounded-lg text-sm text-muted-foreground transition-colors hover:text-foreground pointer-coarse:py-2'

function FooterLinkItem({ link }: { link: FooterLink }) {
  if ('to' in link) {
    return (
      <Link to={link.to} className={linkClass}>
        {link.label}
      </Link>
    )
  }
  return (
    <a href={link.href} target="_blank" rel="noreferrer" className={linkClass}>
      {link.label}
      <ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden />
    </a>
  )
}

export function SiteFooter() {
  const version = useServer((s) => s.config?.version)

  return (
    <footer className="relative isolate overflow-hidden border-t border-border/60 bg-card/40">
      {/* A brand-coloured hairline and a faint glow along the top edge */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/60 to-transparent" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 bg-[radial-gradient(50%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent)]"
      />

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 pt-10 pb-8 sm:px-6 sm:pt-12 md:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)]">
        <div className="grid content-start gap-4">
          <Link to="/" className="w-fit rounded-xl" aria-label="Infinite Bookshelf home">
            <Wordmark />
          </Link>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Turn one idea into a whole book, written live by the AI model you choose. Your books and keys stay in your browser.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {version && <span className="rounded-full border border-border bg-background/60 px-2.5 py-1 font-mono">v{version}</span>}
            <a
              href={`${REPO_URL}/blob/main/LICENSE`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-border bg-background/60 px-2.5 py-1 transition-colors hover:text-foreground"
            >
              Open source · MIT
            </a>
          </div>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-3 gap-x-4 gap-y-8 sm:gap-x-6">
          {COLUMNS.map((column) => (
            <div key={column.title} className="grid content-start gap-3">
              <p className="font-serif text-sm text-primary italic">{column.title}</p>
              <ul className="grid gap-2.5 pointer-coarse:gap-0.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <FooterLinkItem link={link} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl justify-center px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-xs text-muted-foreground sm:px-6">
          <a
            href="https://github.com/Sasivarnasarma"
            target="_blank"
            rel="noreferrer"
            className="group inline-flex w-fit items-center gap-1.5 rounded-lg transition-colors hover:text-foreground"
            aria-label="Made with love by Sasivarnasarma (GitHub)"
          >
            Made with
            <Heart className="size-3.5 fill-primary text-primary group-hover:[animation-duration:0.7s] motion-safe:animate-heartbeat" aria-hidden />
            by
            <span className="font-medium text-foreground/80 underline decoration-primary/40 underline-offset-4 transition-colors group-hover:decoration-primary">
              Sasivarnasarma
            </span>
          </a>
        </div>
      </div>
    </footer>
  )
}
