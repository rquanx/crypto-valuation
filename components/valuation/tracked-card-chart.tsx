'use client'

import { useEffect, useMemo, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'

import { type AggregationInterval, type ChartViewMode } from '@/lib/valuation'
import type { NormalizedMetricType } from '@/lib/ingest'

type ChartSeries = {
  metric: NormalizedMetricType
  name: string
  data: (number | null)[]
}

type TrackedCardChartProps = {
  viewMode: ChartViewMode
  interval: AggregationInterval
  xAxis: string[]
  series: ChartSeries[]
  colors: Record<NormalizedMetricType, string>
  revenueSum: number | null
  pe: number | null
  valuation: number | null
  handleRangeChange?: (nextStartIndex: number, nextEndIndex: number) => void
}

type DataZoomEvent = {
  start?: number
  end?: number
  startValue?: number | string
  endValue?: number | string
  batch?: DataZoomEvent[]
}

export default function TrackedCardChart({ viewMode, interval, xAxis, series, colors, revenueSum, pe, valuation, handleRangeChange }: TrackedCardChartProps) {
  const [echarts, setEcharts] = useState<typeof import('echarts') | null>(null)
  useEffect(() => {
    let mounted = true
    void import('echarts').then((mod) => {
      if (!mounted) return
      setEcharts((mod as { default?: typeof import('echarts') }).default ?? (mod as typeof import('echarts')))
    })
    return () => {
      mounted = false
    }
  }, [])

  const handleDataZoom = (event: DataZoomEvent) => {
    if (!handleRangeChange || !xAxis.length) return
    const main = event.batch?.[0] ?? event
    const resolveIndex = (value: number | string | undefined, percent: number | undefined) => {
      if (typeof value === 'number') return value
      if (typeof value === 'string') {
        const matchIndex = xAxis.indexOf(value)
        if (matchIndex !== -1) return matchIndex
      }
      if (typeof percent === 'number') {
        const ratio = Math.min(Math.max(percent, 0), 100) / 100
        return Math.round(ratio * Math.max(0, xAxis.length - 1))
      }
      return -1
    }

    const startIndex = resolveIndex(main.startValue, main.start)
    const endIndex = resolveIndex(main.endValue, main.end)
    if (startIndex < 0 || endIndex < 0) return
    const clamp = (index: number) => Math.min(Math.max(index, 0), xAxis.length - 1)
    const clampedStart = clamp(startIndex)
    const clampedEnd = clamp(endIndex)
    const nextStart = Math.min(clampedStart, clampedEnd)
    const nextEnd = Math.max(clampedStart, clampedEnd)
    handleRangeChange(nextStart, nextEnd)
  }

  const option = useMemo<EChartsOption>(() => {
    return {
      color: series.map((s) => colors[s.metric] ?? '#3CC8FF'),
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(10,16,27,0.92)',
        borderColor: 'rgba(255,255,255,0.08)',
        textStyle: { color: '#f6fbff' },
        padding: 10,
      },
      legend: {
        top: 10,
        textStyle: { color: '#cdd8ec' },
      },
      grid: { left: 50, right: 24, top: 48, bottom: 70 },
      xAxis: {
        type: 'category',
        data: xAxis,
        axisLabel: {
          color: '#9cb2d1',
          formatter: (value: string) => {
            if (interval === 'month') return value.slice(0, 7)
            return value
          },
        },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#9cb2d1' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      },
      dataZoom: [
        {
          type: 'inside',
          throttle: 80,
        },
        {
          type: 'slider',
          height: 32,
          bottom: 16,
          borderColor: 'rgba(255,255,255,0.1)',
          backgroundColor: 'rgba(255,255,255,0.05)',
          fillerColor: 'rgba(87,199,255,0.25)',
          handleStyle: { color: '#57c7ff', borderColor: '#57c7ff' },
          textStyle: { color: '#9cb2d1' },
          labelFormatter(value, valueStr) {
            return ''
          },
        },
      ],
      series: series.map((serie) => ({
        name: serie.name,
        type: viewMode === 'bar' ? 'bar' : 'line',
        barMaxWidth: viewMode === 'bar' ? (interval === 'day' ? 18 : 26) : undefined,
        emphasis: { focus: 'series' },
        smooth: viewMode === 'cumulative',
        showSymbol: viewMode === 'cumulative',
        connectNulls: true,
        itemStyle: { color: colors[serie.metric] },
        data: serie.data,
      })),
    }
  }, [colors, interval, series, viewMode, xAxis])

  if (!echarts) {
    return <div className="flex h-[360px] items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm text-[#9cb2d1]">加载图表中...</div>
  }
  return (
    <ReactECharts
      echarts={echarts}
      option={option}
      onEvents={{
        datazoom: handleDataZoom,
      }}
      notMerge
      lazyUpdate
      style={{ height: 380, width: '100%' }}
      className="rounded-xl border border-white/10 bg-[radial-gradient(circle_at_14%_12%,rgba(109,242,200,0.08),transparent_28%),radial-gradient(circle_at_90%_10%,rgba(87,199,255,0.08),transparent_30%),linear-gradient(145deg,#0d1a2c_0%,#0b1322_50%,#0a101c_100%)] p-3"
    />
  )
}
