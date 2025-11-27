'use client'

import { Badge } from '@/components/ui/badge'

export function LoadingPulse({ label }: { label: string }) {
  return (
    <Badge variant="muted" className="gap-2 border border-white/10 bg-white/5">
      <span className="h-2 w-2 animate-pulse rounded-full bg-[#6df2c8]" />
      {label}
    </Badge>
  )
}
