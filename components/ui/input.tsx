'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input({ className, type = 'text', ...props }, ref) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-lg border border-white/10 bg-[#0d1724] px-3 py-2 text-sm text-[#e6edf7] ring-offset-[#050913] placeholder:text-[#7c8ba7] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#57c7ff]/70 focus-visible:ring-offset-2 focus-visible:shadow-[0_0_0_8px_rgba(87,199,255,0.08)] disabled:cursor-not-allowed disabled:opacity-60',
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
