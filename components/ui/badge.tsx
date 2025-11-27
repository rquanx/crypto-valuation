'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'outline' | 'success' | 'sky' | 'warning' | 'muted'

const badgeClass: Record<BadgeVariant, string> = {
  default: 'bg-[#0f1b2c] text-[#e0eaff] border border-white/10',
  outline: 'border border-white/30 text-[#e6edf7]',
  success: 'bg-[#123327] text-[#84f5c7] border border-[#6df2c8]/45',
  sky: 'bg-[#0f2235] text-[#8bd7ff] border border-[#57c7ff]/45',
  warning: 'bg-[#2b1d0d] text-[#f7c98c] border border-[#f3b76b]/45',
  muted: 'bg-white/5 text-[#9cb2d1] border border-white/10',
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold', badgeClass[variant], className)} {...props} />
}
