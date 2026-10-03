import { X } from 'lucide-react'
import { Dialog as DialogPrimitive, DropdownMenu as MenuPrimitive, Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/utils'

const popIn =
  'origin-[var(--radix-popper-transform-origin)] data-[state=open]:[animation:pop-in_160ms_ease-out] data-[state=closed]:[animation:pop-out_120ms_ease-in]'

// ---- Dialog -----------------------------------------------------------------------------------

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({ className, children, title, description, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & { title: React.ReactNode; description?: React.ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:[animation:fade-in_160ms_ease-out] data-[state=closed]:[animation:fade-out_120ms_ease-in]" />
      <DialogPrimitive.Content
        className={cn(
          'surface fixed left-1/2 top-1/2 z-50 grid w-[min(92vw,30rem)] -translate-x-1/2 -translate-y-1/2 gap-4 p-6 !bg-card data-[state=open]:[animation:dialog-in_200ms_cubic-bezier(0.16,1,0.3,1)] data-[state=closed]:[animation:fade-out_120ms_ease-in]',
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
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Close">
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
        className={cn('surface z-50 min-w-48 p-1.5 !bg-popover', popIn, className)}
        {...props}
      />
    </MenuPrimitive.Portal>
  )
}

export function MenuItem({ className, danger, ...props }: React.ComponentProps<typeof MenuPrimitive.Item> & { danger?: boolean }) {
  return (
    <MenuPrimitive.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted-foreground',
        danger && 'text-danger data-[highlighted]:bg-danger/10 [&_svg]:text-danger',
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
      <PopoverPrimitive.Content align={align} sideOffset={8} className={cn('surface z-50 w-80 p-4 !bg-popover', popIn, className)} {...props} />
    </PopoverPrimitive.Portal>
  )
}

// ---- Tooltip ----------------------------------------------------------------------------------

export const TooltipProvider = TooltipPrimitive.Provider

export function Tooltip({ content, children, side = 'top' }: { content: React.ReactNode; children: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className={cn('z-50 max-w-64 rounded-lg bg-foreground px-2.5 py-1.5 text-xs text-background shadow-lg', popIn)}>
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
