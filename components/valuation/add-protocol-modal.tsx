/* eslint-disable @next/next/no-img-element */
'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { LoadingPulse } from '@/components/valuation/loading-pulse'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { CoverageItem } from '@/lib/queries'

type AddProtocolModalProps = {
  open: boolean
  onClose: () => void
  onAdd: (item: CoverageItem, pe: number) => Promise<void>
}

export function AddProtocolModal({ open, onClose, onAdd }: AddProtocolModalProps) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<CoverageItem[]>([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [pe, setPe] = useState('15')

  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const fetchOptions = async () => {
      setOptionsLoading(true)
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
          const message = err instanceof Error ? err.message : '加载协议列表失败'
          toast.error(message)
          console.error(err)
        }
      } finally {
        if (!controller.signal.aborted) {
          setOptionsLoading(false)
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
      setOptionsLoading(false)
      setAdding(false)
    }
  }, [open])

  const selectedItem = options.find((item) => item.slug === selectedSlug) ?? null

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="overflow-hidden w-full max-w-5xl">
        <DialogHeader className="px-6">
          <DialogTitle>添加协议</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 px-6 pb-2 md:grid-cols-[1.1fr,0.9fr]">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索名称、Slug 或链" />
              {optionsLoading ? <LoadingPulse label="加载中" /> : null}
            </div>
            <div className="mt-3 max-h-[360px] space-y-2 overflow-auto pr-1 ">
              {options.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/10 p-3 text-sm text-[#9cb2d1]">没有匹配的协议</div>
              ) : (
                options.map((item) => {
                  const chosen = selectedSlug === item.slug
                  return (
                    <button
                      key={item.slug}
                      onClick={() => setSelectedSlug(item.slug)}
                      className={cn(
                        'group flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left transition-all duration-200 ease-out hover:-translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#57c7ff]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a101b]',
                        chosen
                          ? 'border-[#6df2c8]/70 bg-[#6df2c8]/10 shadow-[0_16px_60px_-32px_rgba(87,199,255,0.5)]'
                          : 'border-white/10 bg-white/5 hover:border-[#57c7ff]/50 hover:bg-[#0f1b2c]/80'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        {item.logo ? (
                          <img src={item.logo} alt={item.displayName ?? item.name ?? item.slug} className="h-10 w-10 rounded-full border border-white/10 object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#0f1b2c] text-sm text-[#e6edf7]">
                            {(item.displayName || item.name || item.slug).slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-semibold text-[#f6fbff]">{item.displayName || item.name || item.slug}</div>
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className="text-sm font-semibold text-[#f6fbff]">估值 PE</div>
            <div className="mt-3 space-y-4 text-sm text-[#cdd8ec]">
              <Input type="number" min={0} value={pe} onChange={(e) => setPe(e.target.value)} className="mt-2 w-full" />
            </div>
          </div>
        </div>

        <DialogFooter className="px-6">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={!selectedItem || adding}
            onClick={async () => {
              if (!selectedItem) return
              try {
                setAdding(true)
                const parsedPe = Number(pe) || 15
                await onAdd(selectedItem, Math.max(1, parsedPe))
                onClose()
              } catch (error) {
                const message = error instanceof Error ? error.message : '添加协议失败，请稍后再试'
                toast.error(message)
              } finally {
                setAdding(false)
              }
            }}
          >
            {adding ? '添加中...' : selectedItem ? `添加 ${selectedItem.displayName || selectedItem.name || selectedItem.slug}` : '先选择一个协议'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
