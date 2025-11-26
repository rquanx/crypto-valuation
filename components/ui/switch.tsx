'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export type SwitchProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(function Switch({ className, checked, ...props }, ref) {
  return (
    <label className={cn('relative inline-flex h-6 w-11 cursor-pointer items-center', className)}>
      <input ref={ref} type="checkbox" className="peer sr-only" checked={checked} {...props} />
      <span className="absolute inset-0 rounded-full bg-slate-800 transition peer-checked:bg-emerald-500/80" />
      <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
    </label>
  )
})
