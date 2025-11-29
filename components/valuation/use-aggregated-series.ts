'use client'

import { useMemo } from 'react'

import {
  aggregateSeriesForChart,
  clampDateRange,
  computeAnnualizedValuation,
  sumSeriesByRange,
  type AggregationInterval,
  type ChartDateRange,
  type ChartViewMode,
  type MetricPoint,
} from '@/lib/valuation'
import type { NormalizedMetricType } from '@/lib/ingest'

export type SeriesByMetric = Partial<Record<NormalizedMetricType, MetricPoint[]>>

function daysInMonth(dateStr: string): number {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return 0
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

export function useAggregatedSeries({
  seriesByMetric,
  viewMode,
  interval,
  dateRange,
  pe,
}: {
  seriesByMetric?: SeriesByMetric
  viewMode: ChartViewMode
  interval: AggregationInterval
  dateRange?: ChartDateRange
  pe: number
}) {
  const aggregated = useMemo(
    () =>
      aggregateSeriesForChart({
        seriesByMetric,
        interval,
        viewMode,
      }),
    [seriesByMetric, viewMode, interval]
  )

  const effectiveRange = useMemo(() => clampDateRange(dateRange, aggregated.minDate, aggregated.maxDate), [aggregated.maxDate, aggregated.minDate, dateRange])
  const revenueSum = useMemo(
    () => sumSeriesByRange(aggregated.baseAggregated.revenue, effectiveRange, aggregated.minDate, aggregated.maxDate),
    [aggregated.baseAggregated.revenue, aggregated.maxDate, aggregated.minDate, effectiveRange]
  )

  const windowDays = useMemo(() => {
    const [start, end] = effectiveRange
    const revenueSeries = aggregated.baseAggregated.revenue
    if (!revenueSeries?.length || !start || !end) return null
    let totalDays = 0
    let hasPoint = false
    for (const point of revenueSeries) {
      if (point.date < start || point.date > end) continue
      const bucketDays = interval === 'month' ? daysInMonth(point.date) : interval === 'week' ? 7 : 1
      totalDays += bucketDays
      hasPoint = true
    }
    return hasPoint && totalDays > 0 ? totalDays : null
  }, [aggregated.baseAggregated.revenue, effectiveRange, interval])

  const valuation = useMemo(() => computeAnnualizedValuation(revenueSum, windowDays ?? 0, pe), [pe, revenueSum, windowDays])

  return {
    ...aggregated,
    revenueSum,
    valuation,
    effectiveRange,
    hasData: aggregated.xAxis.length > 0,
  }
}
