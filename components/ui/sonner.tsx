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
          toast: 'bg-[#0b1524]/95 border border-white/10 text-[#e6edf7] shadow-[0_28px_120px_-80px_rgba(0,0,0,0.8)]',
          description: 'text-[#9cb2d1]',
          actionButton: 'bg-gradient-to-r from-[#6df2c8] to-[#57c7ff] text-[#041018]',
          cancelButton: 'bg-white/5 text-[#e6edf7]',
        },
      }}
      {...props}
    />
  )
}
