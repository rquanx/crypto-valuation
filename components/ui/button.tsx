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
  default: 'bg-emerald-500 text-emerald-950 shadow-[0_10px_40px_-16px_rgba(16,185,129,0.7)] hover:bg-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-300/70',
  outline: 'border border-slate-700 bg-slate-900 hover:border-slate-500 hover:bg-slate-800/70 text-slate-50',
  secondary: 'bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700',
  ghost: 'text-slate-200 hover:bg-slate-800/60',
  destructive: 'bg-rose-500 text-rose-50 hover:bg-rose-400',
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
