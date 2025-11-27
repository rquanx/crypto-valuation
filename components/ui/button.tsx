'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive'
type Size = 'sm' | 'md' | 'lg' | 'icon'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  asChild?: boolean
}

const variantClass: Record<Variant, string> = {
  default:
    'bg-gradient-to-r from-[#6df2c8] via-[#57c7ff] to-[#f3b76b] text-[#041018] shadow-[0_18px_60px_-28px_rgba(87,199,255,0.9)] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[#57c7ff]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050913]',
  outline:
    'border border-white/15 bg-white/5 text-[#e6edf7] hover:border-[#57c7ff]/60 hover:text-white focus-visible:ring-2 focus-visible:ring-[#57c7ff]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050913]',
  secondary:
    'bg-[#0f1b2c] text-[#e6edf7] border border-white/10 hover:border-[#6df2c8]/40 hover:bg-[#0c1524] focus-visible:ring-2 focus-visible:ring-[#6df2c8]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050913]',
  ghost: 'text-[#cfd8ec] hover:bg-white/5',
  destructive: 'bg-[#ff7b6b] text-[#1b0b07] hover:bg-[#ff8f82] focus-visible:ring-2 focus-visible:ring-[#ff7b6b]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050913]',
}

const sizeClass: Record<Size, string> = {
  sm: 'h-9 rounded-lg px-3 text-sm',
  md: 'h-10 rounded-lg px-4 text-sm',
  lg: 'h-11 rounded-xl px-6 text-sm',
  icon: 'h-10 w-10 rounded-lg',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'default', size = 'md', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold transition focus-visible:outline-none disabled:opacity-60 disabled:pointer-events-none',
        variantClass[variant],
        sizeClass[size],
        className
      )}
      {...props}
    />
  )
})
