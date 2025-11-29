'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ProtocolAvatar } from '@/components/valuation/protocol-avatar'
import { useAggregatedSeries, type SeriesByMetric } from '@/components/valuation/use-aggregated-series'
import type { NormalizedMetricType } from '@/lib/ingest'
import { cn } from '@/lib/utils'
import { ApiSeriesResponse, formatUSD, formatYi, METRIC_COLORS, metricLabel, type AggregationInterval, type ChartViewMode } from '@/lib/valuation'

const TrackedCardChart = dynamic(() => import('./tracked-card-chart'), { ssr: false })
type ModeChoice = AggregationInterval | 'cumulative'

type TrackedCardModalProps = {
  open: boolean
  onClose: () => void
  name: string
  logo?: string | null
  peFromCard: number
  seriesByMetric?: SeriesByMetric
  refreshKey?: number
  data?: ApiSeriesResponse
}

const DEFAULT_METRIC: NormalizedMetricType = 'revenue'

export function TrackedCardModal({ data, open, onClose, name, logo, peFromCard, seriesByMetric }: TrackedCardModalProps) {
  const [selectedMetrics, setSelectedMetrics] = useState<NormalizedMetricType[]>([DEFAULT_METRIC])
  const [mode, setMode] = useState<ModeChoice>('day')
  const [barInterval, setBarInterval] = useState<AggregationInterval>('day')
  const [dateRange, setDateRange] = useState<[string | null, string | null] | undefined>(undefined)
  const [peLocal, setPeLocal] = useState<string>(() => String(peFromCard ?? ''))

  const mergedSeries = useMemo<SeriesByMetric>(() => seriesByMetric ?? data?.pointsByMetric ?? {}, [data?.pointsByMetric, seriesByMetric])

  const isCumulative = mode === 'cumulative'
  const derivedViewMode: ChartViewMode = isCumulative ? 'cumulative' : 'bar'
  const derivedInterval: AggregationInterval = isCumulative ? barInterval : mode
  const peNumeric = Number(peLocal)
  const isValidPe = Number.isFinite(peNumeric) && peNumeric > 0

  const aggregated = useAggregatedSeries({
    seriesByMetric: mergedSeries,
    viewMode: derivedViewMode,
    interval: derivedInterval,
    dateRange,
    pe: isValidPe ? peNumeric : 0,
  })

  const availableDates = aggregated.availableDates
  const valuation = aggregated.valuation
  const formatTotal = (total: number | null) => {
    if (total == null || !Number.isFinite(total)) return '—'
    const numeric = total || 0
    return numeric > 1e8 ? formatYi(numeric) : formatUSD(numeric)
  }

  const chartSeries = useMemo(
    () =>
      selectedMetrics.map((metric) => ({
        metric,
        name: metricLabel[metric as keyof typeof metricLabel] ?? metric,
        data: aggregated.alignedSeries[metric] ?? aggregated.xAxis.map(() => null),
      })),
    [aggregated.alignedSeries, aggregated.xAxis, selectedMetrics]
  )

  const handleToggleMetric = (metric: NormalizedMetricType) => {
    setSelectedMetrics((prev) => {
      if (prev.includes(metric)) {
        const next = prev.filter((item) => item !== metric)
        return next.length ? next : [metric]
      }
      return [...prev, metric]
    })
  }

  const handleRangeChange = (nextStartIndex: number, nextEndIndex: number) => {
    if (!availableDates.length) return
    const maxIndex = availableDates.length - 1
    const start = Math.min(Math.max(0, nextStartIndex), maxIndex)
    const end = Math.min(Math.max(start, nextEndIndex), maxIndex)
    setDateRange([availableDates[start], availableDates[end]])
  }

  const isEmpty = !aggregated.hasData
  const modeButtons: { key: ModeChoice; label: string }[] = [
    { key: 'day', label: '日' },
    { key: 'week', label: '周' },
    { key: 'month', label: '月' },
    { key: 'cumulative', label: '累计' },
  ]

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="max-w-6xl overflow-hidden">
        <DialogHeader className="flex flex-col gap-2 border-b border-white/5 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ProtocolAvatar logo={logo} label={name} size="md" />
            <div>
              <DialogTitle className="text-xl text-[#f6fbff]">{name}</DialogTitle>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span>PE</span>
              <Input type="number" min={0} value={peLocal} onChange={(e) => setPeLocal(e.target.value)} className="h-9 w-28 bg-transparent" placeholder="输入 PE" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span>当前窗口收入：{formatTotal(aggregated.revenueSum)}</span>
            </div>
            <div className={cn('text-base font-semibold', valuation != null ? 'text-[#6df2c8]' : 'text-[#f3b76b]')}>估值：{formatTotal(valuation)}</div>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-6 pb-6 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              {(['revenue', 'holders_revenue', 'fees'] as NormalizedMetricType[]).map((metric) => (
                <label
                  key={metric}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition',
                    selectedMetrics.includes(metric) ? 'border-[#57c7ff]/60 bg-[#0f1b2c]/90 text-[#f6fbff]' : 'border-white/10 bg-white/5 text-[#9cb2d1] hover:border-white/20'
                  )}
                >
                  <input type="checkbox" className="h-4 w-4 accent-[#57c7ff]" checked={selectedMetrics.includes(metric)} onChange={() => handleToggleMetric(metric)} />
                  <span>{metricLabel[metric as keyof typeof metricLabel] ?? metric}</span>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: METRIC_COLORS[metric] }} />
                </label>
              ))}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
                {modeButtons.map((btn) => (
                  <button
                    key={btn.key}
                    type="button"
                    onClick={() => {
                      setMode(btn.key)
                      if (btn.key !== 'cumulative') setBarInterval(btn.key)
                    }}
                    className={cn('rounded-lg px-3 py-1 text-sm transition', mode === btn.key ? 'bg-white text-[#041018]' : 'text-[#9cb2d1] hover:text-[#f6fbff]')}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isEmpty ? (
            <div className="flex h-[360px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/5 text-sm text-[#9cb2d1]">暂无可绘制的数据</div>
          ) : (
            <TrackedCardChart
              viewMode={derivedViewMode}
              interval={derivedInterval}
              xAxis={aggregated.xAxis}
              series={chartSeries}
              colors={METRIC_COLORS}
              revenueSum={aggregated.revenueSum}
              valuation={valuation}
              pe={isValidPe ? peNumeric : null}
              handleRangeChange={handleRangeChange}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
