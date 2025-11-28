import { NextRequest, NextResponse } from 'next/server'
import { getProtocolSeries } from '@/lib/queries'

export const runtime = 'nodejs'

const parsedCacheSeconds = Number(process.env.API_CACHE_SECONDS)
const CACHE_TTL_SECONDS = Number.isFinite(parsedCacheSeconds) && parsedCacheSeconds > 0 ? parsedCacheSeconds : 43200
const CACHE_CONTROL_HEADER = `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_TTL_SECONDS}`
export const revalidate = CACHE_TTL_SECONDS

export async function GET(_request: NextRequest, context: RouteContext<'/api/metrics/[id]'>) {
  const { id } = await context.params

  const result = getProtocolSeries({ identifier: id })
  if (!result) {
    return NextResponse.json({ ok: false, error: 'Protocol not found' }, { status: 404 })
  }

  const response = NextResponse.json({ ok: true, ...result })
  response.headers.set('Cache-Control', CACHE_CONTROL_HEADER)
  return response
}
