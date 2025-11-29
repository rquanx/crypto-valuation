import type { NormalizedMetricType, StoredProtocol } from './ingest'

export type ActiveMetricType = 'holders_revenue' | 'revenue' | 'fees'
export type ValuationWindow = 1 | 7 | 30 | 90 | 180 | 365
export type StoredTracked = {
  slug: string
  name: string
  logo?: string | null
  pe: number
  enabled: boolean
  addedAt: number
}

export type ApiSeriesResponse = {
  protocol: StoredProtocol
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
  protocol: StoredProtocol
  metricsDetail: Record<ActiveMetricType, MetricDetail>
  latestByMetric: Partial<Record<NormalizedMetricType, string | null>>
}

export const WINDOWS: ValuationWindow[] = [1, 7, 30, 90, 180, 365]
export const METRIC_TYPES: ActiveMetricType[] = ['holders_revenue', 'revenue', 'fees']
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
  fees: 'Fees',
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
  let index = points.length - 1
  while (index >= 0) {
    const point = points[index]
    if (point.date >= cutoff) {
      total += point.value
      used = true
    } else {
      break
    }
    index--
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

export function mergeTrackedWithProtocol(tracked: StoredTracked, protocol: StoredProtocol): StoredTracked {
  return {
    ...tracked,
    name: tracked.name || protocol.displayName || protocol.name || tracked.slug,
    logo: tracked.logo ?? protocol.logo,
  }
}

export function trackedHasDiff(next: StoredTracked, prev: StoredTracked): boolean {
  return next.name !== prev.name || next.logo !== prev.logo
}

export type AggregationInterval = 'day' | 'week' | 'month'
export type ChartViewMode = 'bar' | 'cumulative'
export type ChartDateRange = [string | null, string | null]

export const METRIC_COLORS: Record<NormalizedMetricType, string> = {
  revenue: '#3CC8FF',
  holders_revenue: '#7EE0C3',
  fees: '#F6B26B',
}

export type MetricPoint = { date: string; value: number }

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function parseUTC(dateStr: string): Date | null {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  const normalized = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  return normalized
}

function startOfWeek(date: Date): Date {
  const day = date.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const clone = new Date(date)
  clone.setUTCDate(date.getUTCDate() + diff)
  return clone
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function aggregateByInterval(points: MetricPoint[], interval: AggregationInterval): MetricPoint[] {
  const buckets = new Map<string, number>()
  for (const point of points) {
    const parsed = parseUTC(point.date)
    if (!parsed || point.value <= 0) continue
    const key = interval === 'day' ? toDateKey(parsed) : interval === 'week' ? toDateKey(startOfWeek(parsed)) : toDateKey(startOfMonth(parsed))
    buckets.set(key, (buckets.get(key) ?? 0) + point.value)
  }
  return Array.from(buckets.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, value]) => ({ date, value }))
}

function cumulativeSeries(points: MetricPoint[]): MetricPoint[] {
  let total = 0
  return points.map((point) => {
    total += point.value
    return { ...point, value: total }
  })
}

export function sanitizeSeries(series: MetricPoint[] | undefined): MetricPoint[] {
  if (!series?.length) return []
  return series.filter((point) => Number.isFinite(point.value) && point.value > 0 && Boolean(parseUTC(point.date))).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export function getDateDomain(seriesByMetric: Partial<Record<NormalizedMetricType, MetricPoint[]>>) {
  const allDates = new Set<string>()
  Object.values(seriesByMetric).forEach((series) => {
    series?.forEach((point) => {
      const parsed = parseUTC(point.date)
      if (parsed) allDates.add(toDateKey(parsed))
    })
  })
  const sorted = Array.from(allDates).sort()
  return {
    allDates: sorted,
    minDate: sorted[0] ?? null,
    maxDate: sorted[sorted.length - 1] ?? null,
  }
}

export function clampDateRange(range: ChartDateRange | undefined, minDate: string | null, maxDate: string | null): [string | null, string | null] {
  if (!minDate || !maxDate) return [null, null]
  let [start, end] = range ?? [minDate, maxDate]
  start = start ?? minDate
  end = end ?? maxDate
  if (start < minDate) start = minDate
  if (start > maxDate) start = maxDate
  if (end < minDate) end = minDate
  if (end > maxDate) end = maxDate
  if (start > end) start = end
  return [start, end]
}

export function filterSeriesByRange(series: MetricPoint[], range: ChartDateRange | undefined): MetricPoint[] {
  const [start, end] = range ?? [null, null]
  if (!start || !end) return []
  return series.filter((point) => point.date >= start && point.date <= end)
}

export function aggregateSeriesForChart({
  seriesByMetric,
  interval,
  viewMode,
}: {
  seriesByMetric?: Partial<Record<NormalizedMetricType, MetricPoint[]>>
  interval: AggregationInterval
  viewMode: ChartViewMode
}) {
  const cleaned = (seriesByMetric ?? {}) as Partial<Record<NormalizedMetricType, MetricPoint[]>>
  const sanitizedByMetric = Object.entries(cleaned).reduce((acc, [metric, series]) => {
    acc[metric as NormalizedMetricType] = sanitizeSeries(series)
    return acc
  }, {} as Partial<Record<NormalizedMetricType, MetricPoint[]>>)

  const labelSet = new Set<string>()
  const baseAggregated: Partial<Record<NormalizedMetricType, MetricPoint[]>> = {}
  const displayAggregated: Partial<Record<NormalizedMetricType, MetricPoint[]>> = {}

  METRIC_TYPES.forEach((metric) => {
    const aggregated = aggregateByInterval(sanitizedByMetric[metric] ?? [], interval)
    const display = viewMode === 'cumulative' ? cumulativeSeries(aggregated) : aggregated
    baseAggregated[metric] = aggregated
    displayAggregated[metric] = display
    display.forEach((point) => labelSet.add(point.date))
  })

  const xAxis = Array.from(labelSet).sort()
  if (!xAxis.length) {
    return {
      xAxis: [] as string[],
      alignedSeries: {} as Partial<Record<NormalizedMetricType, (number | null)[]>>,
      revenueSum: null as number | null,
      minDate: null as string | null,
      maxDate: null as string | null,
      availableDates: [] as string[],
      effectiveRange: [null, null] as ChartDateRange,
      baseAggregated,
    }
  }

  const alignedSeries = METRIC_TYPES.reduce((acc, metric) => {
    const map = new Map<string, number>()
    displayAggregated[metric]?.forEach((point) => map.set(point.date, point.value))
    acc[metric] = xAxis.map((label) => map.get(label) ?? null)
    return acc
  }, {} as Partial<Record<NormalizedMetricType, (number | null)[]>>)

  const revenueSum = baseAggregated.revenue?.reduce((sum, point) => sum + point.value, 0) ?? null
  const minDate = xAxis[0]
  const maxDate = xAxis[xAxis.length - 1]

  return {
    xAxis,
    alignedSeries,
    revenueSum,
    minDate,
    maxDate,
    availableDates: xAxis,
    effectiveRange: [minDate, maxDate],
    baseAggregated,
  }
}

export function sumSeriesByRange(series: MetricPoint[] | undefined, range: ChartDateRange | undefined, minDate: string | null, maxDate: string | null): number | null {
  if (!series?.length || !minDate || !maxDate) return null
  const [start, end] = clampDateRange(range, minDate, maxDate)
  if (!start || !end) return null
  let total = 0
  let used = false
  for (const point of series) {
    if (point.date >= start && point.date <= end) {
      total += point.value
      used = true
    }
  }
  return used ? total : null
}
