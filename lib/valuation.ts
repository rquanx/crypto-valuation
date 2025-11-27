import type { NormalizedMetricType } from './ingest'
import type { ProtocolSummary } from './queries'

export type ActiveMetricType = 'holders_revenue' | 'revenue'
export type ValuationWindow = 1 | 7 | 30 | 90 | 180 | 365
export type StoredTracked = {
  slug: string
  defillamaId?: string
  protocolId?: number
  name: string
  logo?: string | null
  category?: string | null
  chains?: string[]
  metric?: 'auto' | ActiveMetricType
  pe: number
  enabled: boolean
  addedAt: number
}

export type ApiSeriesResponse = {
  protocol: ProtocolSummary
  available: Record<NormalizedMetricType, number>
  latestByMetric: Partial<Record<NormalizedMetricType, string | null>>
  pointsByMetric: Partial<Record<NormalizedMetricType, { date: string; value: number }[]>>
}

export type MetricDetail = {
  totals: Record<ValuationWindow, number | null>
  latest: string | null | undefined
  available: number
}

export type ComputedToken = {
  protocol: ProtocolSummary
  metricsDetail: Record<ActiveMetricType, MetricDetail>
  latestByMetric: Partial<Record<NormalizedMetricType, string | null>>
}

export const WINDOWS: ValuationWindow[] = [1, 7, 30, 90, 180, 365]
export const METRIC_TYPES: ActiveMetricType[] = ['holders_revenue', 'revenue']
export const WINDOW_LABELS: Record<ValuationWindow, string> = {
  1: '昨日',
  7: '7天累计',
  30: '30天累计',
  90: '90天累计',
  180: '180天累计',
  365: '365天累计',
}

export const metricLabel: Record<ActiveMetricType, string> = {
  holders_revenue: 'Holders Revenue',
  revenue: 'Revenue',
}

export function formatUSD(value: number | null | undefined, compact = true): string {
  if (value == null || !Number.isFinite(value)) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatYi(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-'
  const yi = value / 1e8
  const num = yi.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return `$${num}${num === '0' ? '' : ' 亿'}`
}

export function cutoffDate(window: number, latest: string): string {
  const base = new Date(latest)
  base.setUTCHours(0, 0, 0, 0)
  base.setUTCDate(base.getUTCDate() - Math.max(0, window - 1))
  return base.toISOString().slice(0, 10)
}

export function sumWindow(points: { date: string; value: number }[] | undefined, window: number): number | null {
  if (!points || !points.length) return null
  const cutoff = cutoffDate(window, points[points.length - 1].date)
  let total = 0
  let used = false
  for (const point of points) {
    if (point.date >= cutoff) {
      total += point.value
      used = true
    }
  }
  return used ? total : null
}

export function computeAnnualizedValuation(total: number | null | undefined, window: number, pe: number): number | null {
  if (total == null || !Number.isFinite(total) || window <= 0) return null
  if (!Number.isFinite(pe)) return null
  return (total / window) * 365 * pe
}

export function computeTokenFromSeries(data: ApiSeriesResponse): ComputedToken {
  const metricsDetail = METRIC_TYPES.reduce((acc, metric) => {
    const totals = WINDOWS.reduce((totalsAcc, window) => {
      totalsAcc[window] = sumWindow(data.pointsByMetric?.[metric], window)
      return totalsAcc
    }, {} as Record<ValuationWindow, number | null>)

    acc[metric] = {
      totals,
      latest: data.latestByMetric?.[metric],
      available: data.available?.[metric] ?? 0,
    }
    return acc
  }, {} as Record<ActiveMetricType, MetricDetail>)

  return {
    protocol: data.protocol,
    metricsDetail,
    latestByMetric: data.latestByMetric,
  }
}

export function mergeTrackedWithProtocol(tracked: StoredTracked, protocol: ProtocolSummary): StoredTracked {
  return {
    ...tracked,
    name: tracked.name || protocol.displayName || protocol.name || tracked.slug,
    defillamaId: protocol.defillamaId,
    protocolId: protocol.id,
    logo: tracked.logo ?? protocol.logo,
    category: tracked.category ?? protocol.category ?? undefined,
    chains: tracked.chains ?? protocol.chains,
  }
}

export function trackedHasDiff(next: StoredTracked, prev: StoredTracked): boolean {
  return (
    next.name !== prev.name ||
    next.defillamaId !== prev.defillamaId ||
    next.protocolId !== prev.protocolId ||
    next.logo !== prev.logo ||
    next.category !== prev.category ||
    JSON.stringify(next.chains || []) !== JSON.stringify(prev.chains || [])
  )
}
