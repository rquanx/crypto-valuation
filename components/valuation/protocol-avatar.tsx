/* eslint-disable @next/next/no-img-element */
'use client'

import { cn } from '@/lib/utils'

const sizeClassName: Record<'sm' | 'md', string> = {
  sm: 'h-10 w-10 text-sm',
  md: 'h-12 w-12 text-lg',
}

type ProtocolAvatarProps = {
  logo?: string | null
  label: string
  size?: 'sm' | 'md'
  className?: string
}

export function ProtocolAvatar({ logo, label, size = 'md', className }: ProtocolAvatarProps) {
  const sizeClasses = sizeClassName[size]
  const initials = (label || '').slice(0, 2).toUpperCase() || '--'

  if (logo) {
    return <img src={logo} alt={label} className={cn('rounded-full border border-white/10 object-cover', sizeClasses, className)} />
  }

  return (
    <div className={cn('flex items-center justify-center rounded-full border border-white/10 bg-[#0f1b2c] font-semibold text-[#e6edf7]', sizeClasses, className)}>
      {initials}
    </div>
  )
}
