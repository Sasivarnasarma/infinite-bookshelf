import { MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import { ScrollRestoration } from 'react-router'
import { Toaster } from 'sonner'

import { AppShell } from '@/components/layout/AppShell'
import { TooltipProvider } from '@/components/ui/overlays'
import { fetchConfig } from '@/lib/api'
import { recoverInterruptedBooks } from '@/lib/runner'
import { applyTheme, usePreferences, useServer } from '@/lib/settings'
import { useSpotlight } from '@/lib/spotlight'

function useTheme() {
  const theme = usePreferences((s) => s.theme)
  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const media = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])
}

function useServerConfig() {
  useEffect(() => {
    let cancelled = false
    const load = async (attempt = 0) => {
      try {
        const config = await fetchConfig()
        if (!cancelled) useServer.getState().setConfig(config)
      } catch (e) {
        if (cancelled) return
        useServer.getState().setError(String(e))
        setTimeout(() => load(attempt + 1), Math.min(30000, 2000 * 2 ** attempt))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])
}

export function App() {
  useTheme()
  useServerConfig()
  useSpotlight()
  useEffect(() => {
    void recoverInterruptedBooks()
  }, [])
  const dark = usePreferences((s) => s.theme) === 'dark'

  return (
    // Motion's JS animations follow the OS "reduce motion" setting, like the CSS ones
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <AppShell />
        <ScrollRestoration />
        <Toaster position="bottom-right" theme={dark ? 'dark' : 'system'} richColors closeButton toastOptions={{ className: 'font-sans' }} />
      </TooltipProvider>
    </MotionConfig>
  )
}
