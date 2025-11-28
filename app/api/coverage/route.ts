import { NextRequest, NextResponse } from 'next/server'
import { getCoverageList } from '@/lib/queries'

export const runtime = 'nodejs'

const parsedCacheSeconds = Number(process.env.API_CACHE_SECONDS)
const CACHE_TTL_SECONDS = Number.isFinite(parsedCacheSeconds) && parsedCacheSeconds > 0 ? parsedCacheSeconds : 43200
const CACHE_CONTROL_HEADER = `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_TTL_SECONDS}`
export const revalidate = CACHE_TTL_SECONDS

function parseLimit(value: string | null): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 50
  return Math.max(1, Math.min(parsed, 300))
}

function parseBoolean(value: string | null): boolean | null {
  if (value == null) return null
  return value === 'true'
}

function parseIds(value: string | null): number[] {
  if (!value) return []
  return Array.from(
    new Set(
      value
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isFinite(v))
    )
  )
}

function parseStrings(value: string | null): string[] {
  if (!value) return []
  return Array.from(
    new Set(
      value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    )
  )
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const search = params.get('search')
  const limit = parseLimit(params.get('limit'))
  const trackedOnlyFlag = parseBoolean(params.get('trackedOnly'))
  const ids = parseIds(params.get('ids'))
  const slugs = parseStrings(params.get('slugs'))

  try {
    const items = getCoverageList({
      search,
      limit,
      trackedOnly: trackedOnlyFlag ?? undefined,
      slugs,
      ids,
    })
    const response = NextResponse.json({ ok: true, items })
    response.headers.set('Cache-Control', CACHE_CONTROL_HEADER)
    return response
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 })
  }
}
