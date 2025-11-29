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
      <div className="fixed inset-0 bg-[#02060f]/70 backdrop-blur-md" onClick={onClose} />
      <div className="flex items-center justify-center min-w-[65vw] absolute left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]">{children}</div>
    </div>,
    document.body
  )
}

export function DialogContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'w-full max-w-4xl rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 via-[#0f1b2c]/90 to-[#0a1220]/95 shadow-[0_36px_160px_-80px_rgba(0,0,0,0.8)] backdrop-blur-lg',
        className
      )}
      {...props}
    />
  )
}

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-1 border-b border-white/5 px-6 py-5', className)} {...props} />
}

export function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-xl font-semibold text-[#f6fbff]', className)} {...props} />
}

export function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-[#9cb2d1]', className)} {...props} />
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-end gap-2 border-t border-white/5 px-6 py-4', className)} {...props} />
}
