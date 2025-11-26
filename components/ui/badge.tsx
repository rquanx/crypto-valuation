'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

type BadgeVariant = 'default' | 'outline' | 'success' | 'sky' | 'warning' | 'muted'

const badgeClass: Record<BadgeVariant, string> = {
  default: 'bg-slate-800 text-slate-100',
  outline: 'border border-slate-700 text-slate-200',
  success: 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30',
  sky: 'bg-sky-500/15 text-sky-200 border border-sky-500/30',
  warning: 'bg-amber-500/15 text-amber-200 border border-amber-500/30',
  muted: 'bg-slate-800/60 text-slate-400 border border-slate-700',
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold', badgeClass[variant], className)} {...props} />
}
