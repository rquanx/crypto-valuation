'use client'

import type { ComponentProps } from 'react'
import { Toaster as SonnerToaster } from 'sonner'

type ToasterProps = ComponentProps<typeof SonnerToaster>

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      theme="dark"
      closeButton
      toastOptions={{
        classNames: {
          toast: 'bg-slate-950/90 border border-slate-800 text-slate-50 shadow-2xl shadow-emerald-500/10',
          description: 'text-slate-400',
          actionButton: 'bg-emerald-500 text-slate-950',
          cancelButton: 'bg-slate-800 text-slate-100',
        },
      }}
      {...props}
    />
  )
}
