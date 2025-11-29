import { NextRequest, NextResponse } from 'next/server'
import { API_CACHE_CONTROL_HEADER, API_CACHE_TTL_SECONDS, parseStringList } from '@/lib/api'
import { touchTracked } from '@/lib/ingest'
import { getCoverageList } from '@/lib/queries'

export const runtime = 'nodejs'
export const revalidate = API_CACHE_TTL_SECONDS

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

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const search = params.get('search')
  const limit = parseLimit(params.get('limit'))
  const trackedOnlyFlag = parseBoolean(params.get('trackedOnly'))
  const ids = parseIds(params.get('ids'))
  const slugs = parseStringList(params.get('slugs'), { allowEmpty: true }) ?? []

  try {
    const items = getCoverageList({
      search,
      limit,
      trackedOnly: trackedOnlyFlag ?? undefined,
      slugs,
      ids,
    })
    const response = NextResponse.json({ ok: true, items })
    response.headers.set('Cache-Control', API_CACHE_CONTROL_HEADER)
    return response
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 })
  }
}
