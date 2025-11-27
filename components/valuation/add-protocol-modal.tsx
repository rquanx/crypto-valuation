/* eslint-disable @next/next/no-img-element */
'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { LoadingPulse } from '@/components/valuation/loading-pulse'
import { cn } from '@/lib/utils'
import type { CoverageItem } from '@/lib/queries'

type AddProtocolModalProps = {
  open: boolean
  onClose: () => void
  onAdd: (item: CoverageItem, pe: number) => Promise<void>
}

export function AddProtocolModal({ open, onClose, onAdd }: AddProtocolModalProps) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<CoverageItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [pe, setPe] = useState('15')

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const fetchOptions = async () => {
      setLoading(true)
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
          // TODO: showtoast message
          console.error(err)
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
    }
  }, [open])

  const selectedItem = options.find((item) => item.slug === selectedSlug) ?? null

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="overflow-hidden border border-slate-900 bg-slate-950/95 w-4/9">
        <DialogHeader className="px-6">
          <DialogTitle>添加协议</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 px-6 pb-2 md:grid-cols-[1.1fr,0.9fr]">
          <div className="rounded-xl border border-slate-900 bg-slate-950/70 p-4">
            <div className="flex items-center gap-3">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索名称、Slug 或链" />
              {loading ? <LoadingPulse label="加载中" /> : null}
            </div>
            <div className="mt-3 max-h-[360px] space-y-2 overflow-auto pr-1 ">
              {options.length === 0 ? (
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
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-900 bg-slate-950/70 p-4">
            <div className="text-sm font-semibold text-slate-100">估值 PE</div>
            <div className="mt-3 space-y-4 text-sm text-slate-200">
              <Input type="number" min={0} value={pe} onChange={(e) => setPe(e.target.value)} className="mt-2 w-full" />
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
