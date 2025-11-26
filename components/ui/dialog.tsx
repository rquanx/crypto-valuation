'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

export interface DialogProps {
  open: boolean
  onClose?: () => void
  children: React.ReactNode
}

export function Dialog({ open, onClose, children }: DialogProps) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  if (!mounted || !open) return null

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center px-4">
        {children}
      </div>
    </div>,
    document.body
  )
}

export function DialogContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('w-full max-w-4xl rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl shadow-slate-950/60', className)} {...props} />
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-1 border-b border-slate-900 px-6 py-5', className)} {...props} />
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-xl font-semibold text-slate-50', className)} {...props} />
}

export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-slate-400', className)} {...props} />
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-end gap-2 border-t border-slate-900 px-6 py-4', className)} {...props} />
}
