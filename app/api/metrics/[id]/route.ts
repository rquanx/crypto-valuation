import { NextRequest, NextResponse } from 'next/server'
import { getProtocolSeries } from '@/lib/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, context: RouteContext<'/api/metrics/[id]'>) {
  const { id } = await context.params

  const result = getProtocolSeries({ identifier: id })
  if (!result) {
    return NextResponse.json({ ok: false, error: 'Protocol not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, ...result })
}
