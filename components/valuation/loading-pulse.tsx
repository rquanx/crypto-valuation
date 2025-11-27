'use client'

import { Badge } from '@/components/ui/badge'

export function LoadingPulse({ label }: { label: string }) {
  return (
    <Badge variant="muted" className="gap-2 border border-slate-800/70 bg-slate-900/70">
      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
      {label}
    </Badge>
  )
}
