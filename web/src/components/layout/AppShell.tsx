import { ArrowRight, BookOpen, Heart, Library, Menu as MenuIcon, Monitor, Moon, PenLine, Settings, Sun, WifiOff, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Link, NavLink, useLocation, useOutlet } from 'react-router'

import { Wordmark } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/overlays'
import { useLive } from '@/lib/runner'
import { usePreferences, useServer, type Theme } from '@/lib/settings'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/new', label: 'Write', icon: PenLine, end: false },
  { to: '/books', label: 'My books', icon: Library, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
]

const THEMES: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'Match system' },
]

function ThemeToggle() {
  const theme = usePreferences((s) => s.theme)
  const set = usePreferences((s) => s.set)
  const current = THEMES.find((t) => t.value === theme) ?? THEMES[2]
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]
  return (
    <Tooltip content={`Theme: ${current.label}. Click for ${next.label.toLowerCase()}.`}>
      <button
        type="button"
        onClick={() => set({ theme: next.value })}
        className="relative grid size-9 place-items-center overflow-hidden rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:size-11"
        aria-label={`Theme: ${current.label}`}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={current.value}
            initial={{ y: -16, opacity: 0, rotate: -40 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            exit={{ y: 16, opacity: 0, rotate: 40 }}
            transition={{ duration: 0.18 }}
          >
            <current.icon className="size-4.5" />
          </motion.span>
        </AnimatePresence>
      </button>
    </Tooltip>
  )
}

function NavLinks({ onNavigate, vertical }: { onNavigate?: () => void; vertical?: boolean }) {
  return (
    <nav className={cn('flex gap-1', vertical && 'flex-col')}>
      {NAV.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate} className="relative">
          {({ isActive }) => (
            <span
              className={cn(
                'relative z-10 flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors pointer-coarse:py-2.5',
                vertical && 'py-3 text-base',
                isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId={vertical ? 'nav-pill-mobile' : 'nav-pill'}
                  className="absolute inset-0 -z-10 rounded-full border border-border bg-card shadow-sm"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <item.icon className="size-4" />
              {item.label}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

/** Behind every page: a faint paper grain and a soft warm glow at the top. Static, so it costs nothing while scrolling. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div className="absolute inset-x-0 top-0 h-160 bg-[radial-gradient(55%_100%_at_50%_0%,color-mix(in_oklab,var(--primary)_10%,transparent),transparent)]" />
      <div className="grain absolute inset-0" />
    </div>
  )
}

function ServerBanner() {
  const error = useServer((s) => s.error)
  if (!error) return null
  return (
    <div className="border-b border-danger/30 bg-danger/10 px-4 py-2 text-center text-sm text-danger">
      <WifiOff className="mr-2 inline size-4" />
      Can't reach the Infinite Bookshelf server. Your books are safe in this browser. Writing will work again once it's back.
    </div>
  )
}

export function AppShell() {
  const location = useLocation()
  // Captured per render, so a page keeps showing its own content while it animates out
  // (a live <Outlet/> would already render the next page inside the exiting one)
  const outlet = useOutlet()
  // The page the mobile menu was opened on: it's open only there, so any navigation
  // (links, the back button, the logo) closes it
  const [menuOpenOn, setMenuOpenOn] = useState<string | null>(null)
  const mobileOpen = menuOpenOn === location.pathname
  const setMobileOpen = (open: boolean) => setMenuOpenOn(open ? location.pathname : null)
  const version = useServer((s) => s.config?.version)
  // The logo traces its loop while any book is being written
  const working = useLive((s) => Object.keys(s.runs).length > 0)

  return (
    <div className="flex min-h-dvh flex-col">
      <Backdrop />
      <ServerBanner />
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:gap-4 sm:px-6">
          <Link to="/" className="mr-2 shrink-0 rounded-xl py-1" aria-label="Infinite Bookshelf home">
            <Wordmark live={working} />
          </Link>
          <div className="hidden md:block">
            <NavLinks />
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <Button asChild variant="brand" size="sm" className="hidden sm:inline-flex">
              <Link to="/new">
                New book <ArrowRight data-nudge />
              </Link>
            </Button>
            <button
              type="button"
              className="grid size-11 place-items-center rounded-xl hover:bg-muted md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="size-5" /> : <MenuIcon className="size-5" />}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-border/60 md:hidden"
            >
              <div className="grid gap-3 p-3">
                <NavLinks vertical onNavigate={() => setMobileOpen(false)} />
                <Button asChild variant="brand" className="sm:hidden">
                  <Link to="/new" onClick={() => setMobileOpen(false)}>
                    New book <ArrowRight data-nudge />
                  </Link>
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {outlet}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="border-t border-border bg-background/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm text-muted-foreground sm:px-6 pointer-coarse:gap-x-2 [&_a]:rounded-lg pointer-coarse:[&_a]:px-2 pointer-coarse:[&_a]:py-2.5">
          <span className="inline-flex items-center gap-2">
            <BookOpen className="size-4" /> Infinite Bookshelf {version && <span className="font-mono text-xs">v{version}</span>}
          </span>
          <Link to="/#privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link to="/#self-host" className="hover:text-foreground">
            Self-host
          </Link>
          <a href="/api/docs" target="_blank" rel="noreferrer" className="hover:text-foreground">
            API docs
          </a>
          <a href="https://github.com/Sasivarnasarma/infinite-bookshelf" target="_blank" rel="noreferrer" className="hover:text-foreground">
            Source code
          </a>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:ml-auto">
            <span>Open source · MIT</span>
            <a
              href="https://github.com/Sasivarnasarma"
              target="_blank"
              rel="noreferrer"
              className="group inline-flex items-center gap-1.5 hover:text-foreground"
              aria-label="Made with love by Sasivarnasarma (GitHub)"
            >
              Made with
              <Heart className="size-4 fill-primary text-primary group-hover:[animation-duration:0.7s] motion-safe:animate-heartbeat" aria-hidden />
              by{' '}
              <span className="font-medium text-foreground/80 underline decoration-primary/40 underline-offset-4 transition-colors group-hover:decoration-primary">
                Sasivarnasarma
              </span>
            </a>
          </span>
        </div>
      </footer>
    </div>
  )
}
