/* eslint-disable @next/next/no-img-element */
'use client'

import { useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LoadingPulse } from '@/components/valuation/loading-pulse'
import { MetricSummaryCard } from '@/components/valuation/metric-summary-card'
import { computeTokenFromSeries, mergeTrackedWithProtocol, trackedHasDiff, type ApiSeriesResponse, type StoredTracked } from '@/lib/valuation'

type TrackedCardProps = {
  item: StoredTracked
  refreshNonce: number
  onPeChange: (slug: string, value: number) => void
  onRemove: (slug: string) => void
  onMetaUpdate?: (slug: string, next: StoredTracked) => void
}

async function fetchMetrics(slug: string): Promise<ApiSeriesResponse> {
  const res = await fetch(`/api/metrics/${encodeURIComponent(slug)}`)
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || `加载 ${slug} 数据失败`)
  return json as ApiSeriesResponse
}
const time = 60 * 1000 * 60 * 12

export function TrackedCard({ item, refreshNonce, onPeChange, onRemove, onMetaUpdate }: TrackedCardProps) {
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['protocolMetrics', item.slug.toLowerCase(), refreshNonce],
    queryFn: () => fetchMetrics(item.slug),
    staleTime: time,
  })

  const computed = useMemo(() => (data ? computeTokenFromSeries(data) : null), [data])

  useEffect(() => {
    if (!computed?.protocol || !onMetaUpdate) return
    const merged = mergeTrackedWithProtocol(item, computed.protocol)
    if (trackedHasDiff(merged, item)) {
      onMetaUpdate(item.slug, merged)
    }
  }, [computed, item, onMetaUpdate])

  const displayName = computed?.protocol.displayName || computed?.protocol.name || item.name || item.slug
  const logo = computed?.protocol.logo || item.logo
  const isPending = isLoading || isFetching
  const errorMessage = error instanceof Error ? error.message : null

  return (
    <Card className="border border-slate-900/80 bg-slate-950/70">
      <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {logo ? (
            <img src={logo} alt={displayName} className="h-12 w-12 rounded-full border border-slate-800 object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-lg font-semibold text-slate-200">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-lg font-semibold text-slate-50">{displayName}</div>
          </div>
          {isPending ? <LoadingPulse label="加载中" /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-1 text-sm">
              <span className="text-slate-400">PE</span>
              <Input type="number" value={item.pe} min={0} onChange={(e) => onPeChange(item.slug, Number(e.target.value))} className="h-9 w-20 bg-transparent" />
            </div>
          </div>
          <Button className="bg-slate-900/60" variant="ghost" size="icon" onClick={() => onRemove(item.slug)} title="移除">
            ×
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {errorMessage ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-100">加载失败：{errorMessage}</div>
        ) : computed ? (
          <div className="grid gap-3 md:grid-cols-2">
            <MetricSummaryCard metric="holders_revenue" detail={computed.metricsDetail.holders_revenue} pe={item.pe} />
            <MetricSummaryCard metric="revenue" detail={computed.metricsDetail.revenue} pe={item.pe} />
          </div>
        ) : isPending ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-300">加载中...</div>
        ) : (
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">暂无数据</div>
        )}
      </CardContent>
    </Card>
  )
}
