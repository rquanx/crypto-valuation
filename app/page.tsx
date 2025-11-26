/* eslint-disable @next/next/no-img-element */
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Space_Grotesk } from 'next/font/google'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type ActiveMetricType = 'holders_revenue' | 'revenue'
type NormalizedMetricType = 'fees' | ActiveMetricType
type ValuationWindow = 1 | 7 | 30 | 90 | 180 | 365

type StoredTracked = {
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

type ApiProtocol = {
  id: number
  defillamaId: string
  slug: string
  name: string | null
  displayName: string | null
  category: string | null
  chains: string[]
  logo: string | null
}

type ApiSeriesResponse = {
  protocol: ApiProtocol
  available: Record<NormalizedMetricType, number>
  latestByMetric: Partial<Record<NormalizedMetricType, string | null>>
  pointsByMetric: Partial<Record<NormalizedMetricType, { date: string; value: number }[]>>
}

type MetricDetail = {
  totals: Record<ValuationWindow, number | null>
  latest: string | null | undefined
  available: number
}

type ComputedToken = {
  protocol: ApiProtocol
  metricsDetail: Record<ActiveMetricType, MetricDetail>
  latestByMetric: Partial<Record<NormalizedMetricType, string | null>>
}

type CoverageItem = ApiProtocol & {
  coverage: Record<NormalizedMetricType, boolean>
  latestByMetric: Partial<Record<NormalizedMetricType, string | null>>
}

const WINDOWS: ValuationWindow[] = [1, 7, 30, 90, 180, 365]
const METRIC_TYPES: ActiveMetricType[] = ['holders_revenue', 'revenue']
const WINDOW_LABELS: Record<ValuationWindow, string> = {
  1: '昨日',
  7: '7天累计',
  30: '30天累计',
  90: '季度累计',
  180: '半年累计',
  365: '365天累计',
}
const STORAGE_KEY = 'crypto-valuation-tracked'

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })

const metricLabel: Record<ActiveMetricType, string> = {
  holders_revenue: 'Holders Revenue',
  revenue: 'Revenue',
}

function formatUSD(value: number | null | undefined, compact = true): string {
  if (value == null || !Number.isFinite(value)) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatYi(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-'
  const yi = value / 1e8
  return `$${yi.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} 亿`
}

function cutoffDate(window: number, lastest: string): string {
  const base = new Date(lastest)
  base.setUTCHours(0, 0, 0, 0)
  base.setUTCDate(base.getUTCDate() - Math.max(0, window - 1))
  return base.toISOString().slice(0, 10)
}

function sumWindow(points: { date: string; value: number }[] | undefined, window: number): number | null {
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

function computeAnnualizedValuation(total: number | null | undefined, window: number, pe: number): number | null {
  if (total == null || !Number.isFinite(total) || window <= 0) return null
  if (!Number.isFinite(pe)) return null
  return (total / window) * 365 * pe
}

function computeTokenFromSeries(data: ApiSeriesResponse): ComputedToken {
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

function metricBadgeVariant(metric?: NormalizedMetricType | null): BadgeProps['variant'] {
  if (metric === 'holders_revenue') return 'success'
  if (metric === 'revenue') return 'sky'
  if (metric === 'fees') return 'warning'
  return 'muted'
}

function ProtocolBadge({ label, metric }: { label: string; metric?: NormalizedMetricType | null }) {
  return <Badge variant={metricBadgeVariant(metric)}>{label}</Badge>
}

function LoadingPulse({ label }: { label: string }) {
  return (
    <Badge variant="muted" className="gap-2 border border-slate-800/70 bg-slate-900/70">
      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
      {label}
    </Badge>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Card className="border-dashed border-slate-800/80 bg-slate-950/40">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <CardTitle className="text-xl">还没有跟踪的协议</CardTitle>
        <CardDescription className="max-w-md text-slate-400">从 DefiLlama 库里挑选一个协议，设置 PE 后即可开始计算估值。</CardDescription>
        <Button onClick={onAdd} size="lg" className="px-6">
          新增跟踪
        </Button>
      </CardContent>
    </Card>
  )
}

function AddProtocolModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (item: CoverageItem, pe: number) => Promise<void> }) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<CoverageItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [pe, setPe] = useState('15')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const fetchOptions = async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams({
          limit: '30',
          trackedOnly: 'false',
        })
        if (search.trim()) params.set('search', search.trim())
        const res = await fetch(`/api/coverage?${params.toString()}`, { signal: controller.signal })
        const data = await res.json()
        if (!data.ok) throw new Error(data.error || '加载失败')
        setOptions(data.items as CoverageItem[])
      } catch (err) {
        if (!controller.signal.aborted) {
          setError((err as Error).message)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void fetchOptions()
    return () => controller.abort()
  }, [open, search])

  useEffect(() => {
    if (!open) {
      setSelectedSlug(null)
      setPe('15')
      setSearch('')
      setError(null)
    }
  }, [open])

  const selectedItem = options.find((item) => item.slug === selectedSlug) ?? null

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="overflow-hidden border border-slate-900 bg-slate-950/95">
        <DialogHeader className="px-6">
          <DialogTitle>添加协议</DialogTitle>
          <DialogDescription>浏览可用的 DefiLlama 数据源，设置 PE 后保存到仪表盘。</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 px-6 pb-2 md:grid-cols-[1.1fr,0.9fr]">
          <div className="rounded-xl border border-slate-900 bg-slate-950/70 p-4">
            <div className="flex items-center gap-3">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索名称、Slug 或链" />
              {loading ? <LoadingPulse label="加载中" /> : null}
            </div>
            <div className="mt-3 max-h-[360px] space-y-2 overflow-auto pr-1">
              {error ? (
                <div className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">{error}</div>
              ) : options.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-800/80 p-3 text-sm text-slate-400">没有匹配的协议</div>
              ) : (
                options.map((item) => {
                  const chosen = selectedSlug === item.slug
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedSlug(item.slug)}
                      className={cn(
                        'group flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition',
                        chosen
                          ? 'border-emerald-400/70 bg-emerald-500/5 shadow-[0_12px_48px_-24px_rgba(16,185,129,0.7)]'
                          : 'border-slate-900 bg-slate-950/80 hover:border-slate-700 hover:bg-slate-900/70'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {item.logo ? (
                          <img src={item.logo} alt={item.displayName ?? item.name ?? item.slug} className="h-10 w-10 rounded-full border border-slate-800 object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-sm text-slate-200">
                            {(item.displayName || item.name || item.slug).slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-semibold text-slate-50">{item.displayName || item.name || item.slug}</div>
                          <div className="text-xs text-slate-400">{item.category || 'Uncategorized'}</div>
                          <div className="text-[11px] text-slate-500">{item.chains.slice(0, 3).join(' · ')}</div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-[11px] text-slate-400">
                        <ProtocolBadge label={metricLabel.holders_revenue} metric={item.coverage.holders_revenue ? 'holders_revenue' : undefined} />
                        <ProtocolBadge label={metricLabel.revenue} metric={item.coverage.revenue ? 'revenue' : undefined} />
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-900 bg-slate-950/70 p-4">
            <div className="text-sm font-semibold text-slate-100">估值假设</div>
            <div className="mt-3 space-y-4 text-sm text-slate-200">
              <div>
                <div className="text-xs uppercase text-slate-500">PE 倍数</div>
                <Input type="number" min={1} step={0.5} value={pe} onChange={(e) => setPe(e.target.value)} className="mt-2 w-full" />
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-300">
                <div className="font-semibold text-slate-100">当前选择</div>
                <div className="mt-2 space-y-1">
                  <div>协议：{selectedItem ? selectedItem.displayName || selectedItem.name || selectedItem.slug : '未选择'}</div>
                  <div>分类：{selectedItem?.category || '未分类'}</div>
                  <div className="flex flex-wrap gap-2">
                    <span>数据覆盖：</span>
                    <ProtocolBadge label={metricLabel.holders_revenue} metric={selectedItem?.coverage.holders_revenue ? 'holders_revenue' : null} />
                    <ProtocolBadge label={metricLabel.revenue} metric={selectedItem?.coverage.revenue ? 'revenue' : null} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={!selectedItem}
            onClick={async () => {
              if (!selectedItem) return
              const parsedPe = Number(pe) || 15
              await onAdd(selectedItem, Math.max(1, parsedPe))
              onClose()
            }}
          >
            {selectedItem ? `添加 ${selectedItem.displayName || selectedItem.name || selectedItem.slug}` : '先选择一个协议'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MetricSummaryCard({ metric, detail, pe }: { metric: ActiveMetricType; detail?: MetricDetail; pe: number }) {
  return (
    <div className="rounded-xl border border-slate-900 bg-slate-950/60 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ProtocolBadge label={metricLabel[metric]} metric={detail?.available ? metric : null} />
          <span className="text-[11px] text-slate-500">{detail?.latest ? `最近 ${detail.latest}` : '暂无数据'}</span>
        </div>
        <div className="text-[11px] text-slate-500">PE {pe}</div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {WINDOWS.map((window) => {
          const total = detail?.totals?.[window] ?? null
          const valuation = computeAnnualizedValuation(total, window, pe)
          return (
            <div key={window} className="rounded-lg border border-slate-900 bg-slate-900/60 p-3">
              <div className="text-[11px] uppercase text-slate-500">{WINDOW_LABELS[window]}</div>
              <div className="mt-2 text-sm font-semibold text-slate-100">{formatUSD(total)}</div>
              <div className="text-[11px] text-slate-500">{WINDOW_LABELS[window]}估值</div>
              <div className="text-sm font-semibold text-emerald-200">{formatYi(valuation)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Home() {
  const [tracked, setTracked] = useState<StoredTracked[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [tokenData, setTokenData] = useState<Record<string, ComputedToken>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const [refreshNonce, setRefreshNonce] = useState(0)

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null
    if (stored) {
      try {
        setTracked(JSON.parse(stored))
      } catch {
        setTracked([])
      }
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tracked))
  }, [tracked, hydrated])

  useEffect(() => {
    if (!tracked.length) {
      setTokenData({})
      return
    }

    const controller = new AbortController()
    const hasDiff = (next: StoredTracked, prev: StoredTracked) =>
      next.name !== prev.name ||
      next.defillamaId !== prev.defillamaId ||
      next.protocolId !== prev.protocolId ||
      next.logo !== prev.logo ||
      next.category !== prev.category ||
      JSON.stringify(next.chains || []) !== JSON.stringify(prev.chains || [])

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const errors: string[] = []
        const responses = await Promise.all(
          tracked.map(async (item) => {
            try {
              const res = await fetch(`/api/metrics/${encodeURIComponent(item.slug)}`, {
                signal: controller.signal,
                cache: 'no-store',
              })
              const json = await res.json()
              if (!json.ok) throw new Error(json.error || `加载 ${item.slug} 数据失败`)
              const data = json as ApiSeriesResponse
              return { tracked: item, data }
            } catch (err) {
              errors.push((err as Error).message)
              return { tracked: item, data: null }
            }
          })
        )

        const updateMap = new Map<string, StoredTracked>()
        const dataMap: Record<string, ComputedToken> = {}

        responses.forEach(({ tracked: trackedItem, data }) => {
          if (!data) return
          const computed = computeTokenFromSeries(data)
          dataMap[trackedItem.slug.toLowerCase()] = computed

          const merged: StoredTracked = {
            ...trackedItem,
            name: trackedItem.name || data.protocol.displayName || data.protocol.name || trackedItem.slug,
            defillamaId: data.protocol.defillamaId,
            protocolId: data.protocol.id,
            logo: trackedItem.logo ?? data.protocol.logo,
            category: trackedItem.category ?? data.protocol.category ?? undefined,
            chains: trackedItem.chains ?? data.protocol.chains,
          }

          if (hasDiff(merged, trackedItem)) {
            updateMap.set(trackedItem.slug.toLowerCase(), merged)
          }
        })

        if (updateMap.size) {
          setTracked((prev) => {
            let changed = false
            const next = prev.map((item) => {
              const update = updateMap.get(item.slug.toLowerCase())
              if (update) {
                changed = true
                return update
              }
              return item
            })
            return changed ? next : prev
          })
        }

        if (errors.length) {
          setError(errors[0])
        }

        setTokenData(dataMap)
      } catch (err) {
        if (!controller.signal.aborted) {
          setError((err as Error).message)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => controller.abort()
  }, [tracked, refreshNonce])

  const filteredTracked = useMemo(() => {
    if (!search.trim()) return tracked
    const term = search.trim().toLowerCase()
    return tracked.filter((item) => {
      const tokens = [item.name, item.slug, ...(item.chains || [])].join(' ').toLowerCase()
      return tokens.includes(term)
    })
  }, [tracked, search])

  const handlePeChange = (slug: string, value: number) => {
    setTracked((prev) => prev.map((item) => (item.slug === slug ? { ...item, pe: Math.max(0, value) } : item)))
  }

  const handleRemove = (slug: string) => {
    setTracked((prev) => prev.filter((item) => item.slug !== slug))
  }

  const handleAdd = async (item: CoverageItem, pe: number) => {
    setTracked((prev) => {
      if (prev.some((row) => row.slug.toLowerCase() === item.slug.toLowerCase())) return prev
      return [
        ...prev,
        {
          slug: item.slug,
          defillamaId: item.defillamaId,
          protocolId: item.id,
          name: item.displayName || item.name || item.slug,
          logo: item.logo,
          category: item.category ?? undefined,
          chains: item.chains,
          pe,
          enabled: true,
          addedAt: Date.now(),
        },
      ]
    })

    // Tell backend to ingest this protocol (fire and forget)
    fetch(`/api/tracked`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: item.slug }),
    })
      .then((r) => setRefreshNonce((n) => n + 1))
      .catch(() => undefined)
  }

  return (
    <div className={cn(spaceGrotesk.className, 'min-h-screen')}>
      <div className="mx-auto max-w-6xl px-5 py-10 space-y-6">
        <Card className="border border-slate-900/70 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-emerald-300">Crypto Valuation</div>
              <CardTitle className="text-3xl sm:text-4xl">收入估值仪表盘</CardTitle>
            </div>
          </CardHeader>
        </Card>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索名称 / Slug / 链" className="w-72" />
            {error ? <Badge variant="warning">{error}</Badge> : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setRefreshNonce((n) => n + 1)}>
              刷新数据
            </Button>
            <Button onClick={() => setShowModal(true)}>新增协议</Button>
          </div>
        </div>

        <div className="space-y-4">
          {!filteredTracked.length ? (
            <EmptyState onAdd={() => setShowModal(true)} />
          ) : (
            filteredTracked.map((item) => {
              const apiItem = tokenData[item.slug.toLowerCase()]
              const displayName = apiItem?.protocol.displayName || apiItem?.protocol.name || item.name || item.slug
              const chains = apiItem?.protocol.chains || item.chains || []
              const category = apiItem?.protocol.category || item.category || 'Uncategorized'

              return (
                <Card key={item.slug} className="border border-slate-900/80 bg-slate-950/70">
                  <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      {apiItem?.protocol.logo || item.logo ? (
                        <img src={(apiItem?.protocol.logo || item.logo) as string} alt={displayName} className="h-12 w-12 rounded-full border border-slate-800 object-cover" />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-lg font-semibold text-slate-200">
                          {displayName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="text-lg font-semibold text-slate-50">{displayName}</div>
                        <div className="text-sm text-slate-400">{item.slug}</div>
                        <div className="text-[11px] text-slate-500">{chains.slice(0, 3).join(' · ') || 'Unknown chain'}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="muted" className="border border-slate-800/80 bg-slate-900/70">
                        {category}
                      </Badge>
                      {apiItem?.latestByMetric ? (
                        <Badge variant="outline" className="border-slate-800/80 bg-slate-900/60">
                          最近 {apiItem.latestByMetric.revenue ?? apiItem.latestByMetric.holders_revenue ?? '-'}
                        </Badge>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm">
                          <span className="text-slate-400">PE 假设</span>
                          <Input type="number" value={item.pe} min={0} step={0.5} onChange={(e) => handlePeChange(item.slug, Number(e.target.value))} className="h-9 w-20 bg-transparent" />
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleRemove(item.slug)} title="移除">
                        ×
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <MetricSummaryCard metric="holders_revenue" detail={apiItem?.metricsDetail?.holders_revenue} pe={item.pe} />
                      <MetricSummaryCard metric="revenue" detail={apiItem?.metricsDetail?.revenue} pe={item.pe} />
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </div>
      </div>

      <AddProtocolModal open={showModal} onClose={() => setShowModal(false)} onAdd={handleAdd} />
    </div>
  )
}
