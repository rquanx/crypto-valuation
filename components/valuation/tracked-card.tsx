'use client'

import { useCallback, useEffect, useMemo } from 'react'
import { useDrag, useDrop } from 'react-dnd'
import { useQuery } from '@tanstack/react-query'
import { GripVertical } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LoadingPulse } from '@/components/valuation/loading-pulse'
import { MetricSummaryCard } from '@/components/valuation/metric-summary-card'
import { ProtocolAvatar } from '@/components/valuation/protocol-avatar'
import { cn } from '@/lib/utils'
import { computeTokenFromSeries, mergeTrackedWithProtocol, trackedHasDiff, type ApiSeriesResponse, type StoredTracked } from '@/lib/valuation'

type DragItem = {
  slug: string
}

type TrackedCardProps = {
  item: StoredTracked
  refreshNonce: number
  onPeChange: (slug: string, value: number) => void
  onRemove: (slug: string) => void
  onMetaUpdate?: (slug: string, next: StoredTracked) => void
  onMove?: (fromSlug: string, toSlug: string) => void
}

async function fetchMetrics(slug: string): Promise<ApiSeriesResponse> {
  const res = await fetch(`/api/metrics/${encodeURIComponent(slug)}`)
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || `加载 ${slug} 数据失败`)
  return json as ApiSeriesResponse
}
const time = 60 * 1000 * 60 * 12

const DRAG_TYPE = 'TRACKED_CARD'

export function TrackedCard({ item, refreshNonce, onPeChange, onRemove, onMetaUpdate, onMove }: TrackedCardProps) {
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
  const [{ isOver }, drop] = useDrop<DragItem, void, { isOver: boolean }>(() => ({
    accept: DRAG_TYPE,
    drop: (dragItem) => {
      if (dragItem.slug !== item.slug) onMove?.(dragItem.slug, item.slug)
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }) && monitor.getItem()?.slug !== item.slug,
    }),
  }), [item.slug, onMove])
  const [{ isDragging }, drag] = useDrag<DragItem, void, { isDragging: boolean }>(() => ({
    type: DRAG_TYPE,
    item: { slug: item.slug },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }), [item.slug])
  const cardRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) drop(node)
    },
    [drop]
  )
  const dragHandleRef = useCallback(
    (node: HTMLButtonElement | null) => {
      if (node) drag(node)
    },
    [drag]
  )
  const cardClassName = cn(
    'border-white/10 bg-[radial-gradient(circle_at_14%_12%,rgba(109,242,200,0.08),transparent_28%),radial-gradient(circle_at_90%_10%,rgba(87,199,255,0.08),transparent_30%),linear-gradient(145deg,#0d1a2c_0%,#0b1322_50%,#0a101c_100%)]',
    isDragging && 'opacity-70',
    isOver && 'ring-2 ring-[#6df2c8]/45 border-[#6df2c8]/40 shadow-[0_28px_120px_-70px_rgba(109,242,200,0.45)]'
  )

  return (
    <div ref={cardRef}>
      <Card className={cardClassName}>
        <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {onMove ? (
              <button
                ref={dragHandleRef}
                type="button"
                className="flex h-9 w-9 cursor-grab items-center justify-center rounded-xl border border-white/10 bg-white/5 text-[#9cb2d1] transition hover:-translate-y-[1px] hover:border-[#6df2c8]/60 hover:text-[#6df2c8]"
                aria-label="拖动调整顺序"
              >
                <GripVertical className="h-4 w-4" />
              </button>
            ) : null}
            <ProtocolAvatar logo={logo} label={displayName} size="md" />
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
    </div>
  )
}
