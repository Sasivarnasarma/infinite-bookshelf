import { cn, hueFrom } from '@/lib/utils'

/**
 * A generated cover: colours come from the book's title, so every book looks distinct but
 * consistent. Pure CSS, no images.
 */
export function BookCover({ title, topic, className, size = 'md' }: { title: string; topic?: string; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const hue = hueFrom(title || topic || '')
  const hue2 = (hue + 48) % 360
  return (
    <div
      className={cn(
        'relative isolate flex aspect-3/4 flex-col overflow-hidden rounded-l-[5px] rounded-r-xl text-white shadow-[0_12px_28px_-10px_rgba(0,0,0,0.45),inset_4px_0_0_rgba(0,0,0,0.18)]',
        size === 'sm' && 'w-12 rounded-r-md p-1.5',
        size === 'md' && 'w-full p-4',
        size === 'lg' && 'w-44 p-5 sm:w-52',
        className,
      )}
      style={{
        background: `radial-gradient(120% 90% at 85% 10%, oklch(0.78 0.14 ${hue2} / 0.9), transparent 55%), linear-gradient(160deg, oklch(0.55 0.16 ${hue}), oklch(0.32 0.12 ${(hue + 20) % 360}))`,
      }}
      aria-hidden
    >
      {/* Spine highlight and subtle cloth texture */}
      <div className="absolute inset-y-0 left-1.5 w-px bg-white/25" />
      <div className="absolute inset-0 -z-10 bg-[repeating-linear-gradient(45deg,#fff_0_1px,transparent_1px_6px)] opacity-[0.12]" />
      {size !== 'sm' && (
        <>
          <div className="mb-auto h-0.5 w-8 rounded-full bg-white/60" />
          <p
            className={cn(
              'font-display leading-tight font-medium text-balance wrap-anywhere hyphens-auto drop-shadow-sm',
              size === 'lg' ? 'line-clamp-5 text-base sm:line-clamp-6 sm:text-xl' : 'line-clamp-4 text-[15px]',
            )}
          >
            {title || 'Untitled'}
          </p>
          <p className="mt-2 truncate text-[10px] font-medium tracking-[0.18em] text-white/70 uppercase">Infinite Bookshelf</p>
        </>
      )}
    </div>
  )
}
