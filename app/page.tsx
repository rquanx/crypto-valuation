/* eslint-disable @next/next/no-img-element */
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Space_Grotesk } from 'next/font/google'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AddProtocolModal } from '@/components/valuation/add-protocol-modal'
import { EmptyState } from '@/components/valuation/empty-state'
import { LoadingPulse } from '@/components/valuation/loading-pulse'
import { MetricSummaryCard } from '@/components/valuation/metric-summary-card'
import { cn } from '@/lib/utils'
import type { CoverageItem } from '@/lib/queries'
import { computeTokenFromSeries, type ActiveMetricType, type ApiSeriesResponse, type ComputedToken } from '@/lib/valuation'

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

const STORAGE_KEY = 'crypto-valuation-tracked'

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })

export default function Home() {
  const [tracked, setTracked] = useState<StoredTracked[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [tokenData, setTokenData] = useState<Record<string, ComputedToken>>({})
  const [loading, setLoading] = useState(false)
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
          // TODO: showtoast message with errors[0]
        }

        setTokenData(dataMap)
      } catch (err) {
        if (!controller.signal.aborted) {
          // TODO: showtoast message
          console.error(err)
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
    setLoading(true)
    fetch(`/api/tracked`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: item.slug }),
    })
      .then(() => {
        setRefreshNonce((n) => n + 1)
        setLoading(false)
      })
      .catch(() => undefined)
  }

  return (
    <div className={cn(spaceGrotesk.className, 'min-h-screen')}>
      <div className="mx-auto max-w-6xl px-5 py-5 space-y-4">
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
            <EmptyState onAdd={() => setShowModal(true)} search={search} />
          ) : (
            filteredTracked.map((item) => {
              const apiItem = tokenData[item.slug.toLowerCase()]
              const displayName = apiItem?.protocol.displayName || apiItem?.protocol.name || item.name || item.slug
              return (
                <Card key={item.slug} className="border border-slate-900/80 bg-slate-950/70">
                  <CardHeader className="sm:flex-row sm:items-center sm:justify-between">
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
                      </div>
                      {loading ? <LoadingPulse label="加载中" /> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-1 text-sm">
                          <span className="text-slate-400">PE</span>
                          <Input type="number" value={item.pe} min={0} onChange={(e) => handlePeChange(item.slug, Number(e.target.value))} className="h-9 w-20 bg-transparent" />
                        </div>
                      </div>
                      <Button className="bg-slate-900/60 w-11 h-11" variant="ghost" size="icon" onClick={() => handleRemove(item.slug)} title="移除">
                        X
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-0">
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
