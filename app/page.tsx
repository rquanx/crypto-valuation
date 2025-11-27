'use client'

import { useEffect, useMemo, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Space_Grotesk } from 'next/font/google'

import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AddProtocolModal } from '@/components/valuation/add-protocol-modal'
import { EmptyState } from '@/components/valuation/empty-state'
import { TrackedCard } from '@/components/valuation/tracked-card'
import { cn } from '@/lib/utils'
import type { CoverageItem } from '@/lib/queries'
import { trackedHasDiff, type StoredTracked } from '@/lib/valuation'

const STORAGE_KEY = 'crypto-valuation-tracked'

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })

export default function Home() {
  const [queryClient] = useState(() => new QueryClient())
  const [tracked, setTracked] = useState<StoredTracked[]>(() => {
    if (typeof window === 'undefined') return []
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    try {
      return JSON.parse(stored)
    } catch {
      return []
    }
  })
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')
  const [refreshNonce, setRefreshNonce] = useState(0)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tracked))
  }, [tracked])

  const filteredTracked = useMemo(() => {
    if (!search.trim()) return tracked
    const term = search.trim().toLowerCase()
    return tracked.filter((item) => {
      const tokens = [item.name, item.slug].join(' ').toLowerCase()
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
    await fetch(`/api/tracked`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: item.slug }),
    })

    setTracked((prev) => {
      if (prev.some((row) => row.slug.toLowerCase() === item.slug.toLowerCase())) return prev
      return [
        ...prev,
        {
          slug: item.slug,
          name: item.displayName || item.name || item.slug,
          logo: item.logo,
          pe,
          enabled: true,
          addedAt: Date.now(),
        },
      ]
    })
  }

  const handleMetaUpdate = (slug: string, next: StoredTracked) => {
    setTracked((prev) => prev.map((item) => (item.slug === slug && trackedHasDiff(next, item) ? next : item)))
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className={cn(spaceGrotesk.className, 'min-h-screen')}>
        <div className="mx-auto max-w-6xl px-5 py-5 space-y-4">
          <Card className="border-white/10 bg-[radial-gradient(circle_at_22%_22%,rgba(109,242,200,0.16),transparent_32%),radial-gradient(circle_at_82%_10%,rgba(87,199,255,0.16),transparent_30%),linear-gradient(120deg,#0f1f33_0%,#0c1524_55%,#0a101b_100%)]">
            <CardHeader className="flex flex-col gap-3 border-none sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-[#6df2c8]">Crypto Valuation</div>
                <CardTitle className="text-3xl sm:text-4xl tracking-tight text-[#f6fbff]">收入估值仪表盘</CardTitle>
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
              filteredTracked.map((item) => <TrackedCard key={item.slug} item={item} refreshNonce={refreshNonce} onPeChange={handlePeChange} onRemove={handleRemove} onMetaUpdate={handleMetaUpdate} />)
            )}
          </div>
        </div>

        <AddProtocolModal open={showModal} onClose={() => setShowModal(false)} onAdd={handleAdd} />
      </div>
    </QueryClientProvider>
  )
}
