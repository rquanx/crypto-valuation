'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardTitle } from '@/components/ui/card'

export function EmptyState({ onAdd, search }: { onAdd: () => void; search?: string }) {
  return (
    <Card className="border-dashed border-white/15 bg-white/5">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <CardTitle className="text-xl text-[#f6fbff]">没有跟踪的协议</CardTitle>
        {!search && (
          <Button onClick={onAdd} size="lg" className="px-6">
            新增跟踪
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
