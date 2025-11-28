'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 bg-liner-to-br from-white/5 via-[#0f1b2c]/85 to-[#0a1220]/90 backdrop-blur-sm shadow-[0_28px_120px_-70px_rgba(0,0,0,0.8)] transition-all duration-300 ease-out hover:-translate-y-[3px] hover:border-white/16 hover:shadow-[0_36px_140px_-80px_rgba(87,199,255,0.35)]',
        className
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 border-white/5 px-6 pb-4 pt-5', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-semibold leading-tight text-[#f6fbff]', className)} {...props} />
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-[#9db0cc]', className)} {...props} />
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-6 py-5', className)} {...props} />
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center px-6 pb-5 pt-4 border-t border-white/5', className)} {...props} />
}
