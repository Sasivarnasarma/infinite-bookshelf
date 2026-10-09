import { X } from 'lucide-react'
import { Dialog as DialogPrimitive, DropdownMenu as MenuPrimitive, Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/utils'

const popIn = 'origin-(--radix-popper-transform-origin) data-[state=open]:animate-[pop-in_160ms_ease-out] data-[state=closed]:animate-[pop-out_120ms_ease-in]'

// ---- Dialog -----------------------------------------------------------------------------------

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { title: React.ReactNode; description?: React.ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=closed]:animate-[fade-out_120ms_ease-in] data-[state=open]:animate-[fade-in_160ms_ease-out]" />
      <DialogPrimitive.Content
        className={cn(
          'surface fixed top-1/2 left-1/2 z-50 grid max-h-[90dvh] w-[min(92vw,30rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto bg-card! p-6 data-[state=closed]:animate-[fade-out_120ms_ease-in] data-[state=open]:animate-[dialog-in_200ms_cubic-bezier(0.16,1,0.3,1)]',
          // Phones: a sheet that slides up from the bottom edge, within thumb reach
          'max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] max-sm:data-[state=closed]:animate-[sheet-out_180ms_ease-in] max-sm:data-[state=open]:animate-[sheet-in_260ms_cubic-bezier(0.16,1,0.3,1)]',
          className,
        )}
        {...props}
      >
        <div className="grid gap-1.5 pr-6">
          <DialogPrimitive.Title className="font-display text-xl font-medium">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
        </div>
        {children}
        <DialogPrimitive.Close
          className="absolute top-4 right-4 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground pointer-coarse:top-2.5 pointer-coarse:right-2.5 pointer-coarse:p-3"
          aria-label="Close"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

// ---- Dropdown menu ----------------------------------------------------------------------------

export const Menu = MenuPrimitive.Root
export const MenuTrigger = MenuPrimitive.Trigger

export function MenuContent({ className, align = 'end', ...props }: React.ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        align={align}
        sideOffset={6}
        collisionPadding={12}
        className={cn('surface z-50 max-w-[calc(100vw-1.5rem)] min-w-48 bg-popover! p-1.5', popIn, className)}
        {...props}
      />
    </MenuPrimitive.Portal>
  )
}

export function MenuItem({ className, danger, ...props }: React.ComponentProps<typeof MenuPrimitive.Item> & { danger?: boolean }) {
  return (
    <MenuPrimitive.Item
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-muted pointer-coarse:py-3 [&_svg]:size-4 [&_svg]:text-muted-foreground',
        danger && 'text-danger data-highlighted:bg-danger/10 [&_svg]:text-danger',
        className,
      )}
      {...props}
    />
  )
}

// ---- Popover ----------------------------------------------------------------------------------

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger

export function PopoverContent({ className, align = 'start', ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={8}
        collisionPadding={12}
        // On short windows the content scrolls instead of running off the screen
        className={cn(
          'surface z-50 max-h-(--radix-popover-content-available-height) w-80 max-w-[calc(100vw-1.5rem)] overflow-y-auto bg-popover! p-4',
          popIn,
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

// ---- Tooltip ----------------------------------------------------------------------------------

export const TooltipProvider = TooltipPrimitive.Provider

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn('z-50 max-w-64 rounded-lg bg-foreground px-2.5 py-1.5 text-xs text-background shadow-lg', popIn)}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
