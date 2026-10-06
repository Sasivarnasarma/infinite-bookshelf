import { useEffect } from 'react'

/**
 * Tracks the pointer over any `.spotlight` element and exposes its position as --mx/--my, which
 * the CSS turns into a soft glow that follows the cursor. One listener for the whole app.
 */
export function useSpotlight() {
  useEffect(() => {
    if (matchMedia('(hover: none)').matches) return
    let frame = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const el = (e.target as Element | null)?.closest?.('.spotlight') as HTMLElement | null
        if (!el) return
        const rect = el.getBoundingClientRect()
        el.style.setProperty('--mx', `${e.clientX - rect.left}px`)
        el.style.setProperty('--my', `${e.clientY - rect.top}px`)
      })
    }
    document.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      document.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(frame)
    }
  }, [])
}
