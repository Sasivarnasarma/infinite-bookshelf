import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

/**
 * A field of tiny dots whose brightness ripples like a slow wave. Decorative only.
 * Runs at ~30 fps, pauses when off-screen or the tab is hidden, and draws a single still frame
 * when the user prefers reduced motion.
 */
export function DotWave({
  className,
  color = '255, 255, 255',
  spacing = 9,
  size = 1.6,
  intensity = 0.55,
}: {
  className?: string
  /** "r, g, b" */
  color?: string
  spacing?: number
  size?: number
  intensity?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0
    let height = 0
    let frame = 0
    let visible = true
    let last = 0

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw(performance.now())
    }

    const draw = (now: number) => {
      const t = now / 1000
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = `rgb(${color})`
      for (let y = spacing / 2; y < height; y += spacing) {
        const ny = y / height
        for (let x = spacing / 2; x < width; x += spacing) {
          const nx = x / width
          // Two drifting waves plus a vertical falloff toward the top
          const wave = Math.sin(nx * 9 + t * 0.9) * 0.5 + Math.sin(nx * 4 - ny * 6 + t * 0.6) * 0.5
          const alpha = (0.18 + 0.82 * Math.max(0, wave)) * intensity * (0.25 + 0.75 * ny)
          if (alpha < 0.03) continue
          ctx.globalAlpha = alpha
          ctx.fillRect(x, y, size, size)
        }
      }
      ctx.globalAlpha = 1
    }

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      if (!visible || document.hidden || now - last < 33) return
      last = now
      draw(now)
    }

    const observer = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting))
    observer.observe(canvas)
    const sizeObserver = new ResizeObserver(resize)
    sizeObserver.observe(canvas)
    resize()
    if (!reduced) frame = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      sizeObserver.disconnect()
    }
  }, [color, spacing, size, intensity])

  return <canvas ref={canvasRef} aria-hidden className={cn('pointer-events-none absolute inset-0 size-full', className)} />
}
