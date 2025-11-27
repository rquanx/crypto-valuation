'use client'

import { Badge, type BadgeProps } from '@/components/ui/badge'
import type { NormalizedMetricType } from '@/lib/ingest'

function metricBadgeVariant(metric?: NormalizedMetricType | null): BadgeProps['variant'] {
  if (metric === 'holders_revenue') return 'success'
  if (metric === 'revenue') return 'sky'
  if (metric === 'fees') return 'warning'
  return 'muted'
}

export function ProtocolBadge({ label, metric }: { label: string; metric?: NormalizedMetricType | null }) {
  return <Badge variant={metricBadgeVariant(metric)}>{label}</Badge>
}
