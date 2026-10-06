import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/lib/utils'

/*
 * Pill buttons. Icons marked with data-nudge (e.g. a trailing arrow) slide on hover; the brand
 * variant also gets a light sweep across it.
 */
const buttonVariants = cva(
  'group/btn relative inline-flex shrink-0 items-center justify-center gap-2 overflow-hidden rounded-full text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-200 select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg[data-nudge]]:transition-transform hover:[&_svg[data-nudge]]:translate-x-0.5',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        brand:
          'bg-primary text-primary-foreground shadow-[0_8px_24px_-10px_var(--primary)] before:absolute before:inset-y-0 before:left-0 before:w-1/3 before:translate-x-[-120%] before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)] hover:-translate-y-px hover:bg-primary-hover hover:shadow-[0_12px_30px_-10px_var(--primary)] hover:before:animate-[shine_0.9s_ease]',
        secondary: 'bg-muted text-foreground hover:bg-[color-mix(in_oklab,var(--muted)_85%,var(--foreground))]',
        outline: 'border border-border bg-card text-foreground hover:border-[color-mix(in_oklab,var(--border)_50%,var(--foreground))]',
        inverse: 'bg-white text-neutral-900 shadow-sm hover:bg-white/90',
        ghost: 'text-foreground hover:bg-muted',
        danger: 'bg-danger text-white hover:brightness-110',
        link: 'h-auto rounded-none px-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        // Touch screens get larger targets (pointer-coarse): at least 40px, most 44px
        sm: 'h-8 px-3.5 text-[13px] pointer-coarse:h-10 pointer-coarse:px-4',
        md: 'h-10 px-5 pointer-coarse:h-11',
        lg: 'h-12 px-7 text-[15px]',
        icon: 'size-9 pointer-coarse:size-11',
        'icon-sm': 'size-8 pointer-coarse:size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : 'button'
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
})
Button.displayName = 'Button'
