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
    <Card className="border-white/10 bg-[radial-gradient(circle_at_14%_12%,rgba(109,242,200,0.08),transparent_28%),radial-gradient(circle_at_90%_10%,rgba(87,199,255,0.08),transparent_30%),linear-gradient(145deg,#0d1a2c_0%,#0b1322_50%,#0a101c_100%)]">
      <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {logo ? (
            <img src={logo} alt={displayName} className="h-12 w-12 rounded-full border border-white/10 object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[#0f1b2c] text-lg font-semibold text-[#e6edf7]">
              {displayName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <div className="text-lg font-semibold text-[#f6fbff]">{displayName}</div>
          </div>
          {isPending ? <LoadingPulse label="加载中" /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-sm">
              <span className="text-[#9cb2d1]">PE</span>
              <Input type="number" value={item.pe} min={0} onChange={(e) => onPeChange(item.slug, Number(e.target.value))} className="h-9 w-20 bg-transparent" />
            </div>
          </div>
          <Button className="text-[#9cb2d1]" variant="ghost" size="icon" onClick={() => onRemove(item.slug)} title="移除">
            ×
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {errorMessage ? (
          <div className="rounded-lg border border-[#f3b76b]/45 bg-[#f3b76b]/12 p-3 text-sm text-[#f7d9a1]">加载失败：{errorMessage}</div>
        ) : computed ? (
          <div className="grid gap-3 md:grid-cols-2">
            <MetricSummaryCard metric="holders_revenue" detail={computed.metricsDetail.holders_revenue} pe={item.pe} />
            <MetricSummaryCard metric="revenue" detail={computed.metricsDetail.revenue} pe={item.pe} />
          </div>
        ) : isPending ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-[#cdd8ec]">加载中...</div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-[#9cb2d1]">暂无数据</div>
        )}
      </CardContent>
    </Card>
  )
}
