import { NextRequest, NextResponse } from 'next/server'
import { addTrackedProtocolBySlug, type NormalizedMetricType } from '@/lib/ingest'
import { getProtocolSeries } from '@/lib/queries'
import { triggerIngestNow } from '@/lib/scheduler'

export const runtime = 'nodejs'

const parsedCacheSeconds = Number(process.env.API_CACHE_SECONDS)
const CACHE_TTL_SECONDS = Number.isFinite(parsedCacheSeconds) && parsedCacheSeconds > 0 ? parsedCacheSeconds : 43200
const CACHE_CONTROL_HEADER = `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${CACHE_TTL_SECONDS}`
export const revalidate = CACHE_TTL_SECONDS

function hasAnyData(result: { available: Record<NormalizedMetricType, number> }): boolean {
  return Object.values(result.available).some((count) => count > 0)
}

export async function GET(_request: NextRequest, context: RouteContext<'/api/metrics/[id]'>) {
  const { id } = await context.params

  let result = getProtocolSeries({ identifier: id })
  let slug = result?.protocol.slug ?? id
  let ingestTriggered = false

  // If we have no protocol or no data, try to add/track it and fetch fresh data once.
  if (!result || !hasAnyData(result)) {
    try {
      const tracked = await addTrackedProtocolBySlug(slug)
      slug = tracked.slug
    } catch (error) {
      return NextResponse.json({ ok: false, error: 'Protocol not found' }, { status: 404 })
    }

    const ingestResult = await triggerIngestNow('metrics-api', {
      protocolFilter: { slugs: [slug] },
    })
    ingestTriggered = Boolean(ingestResult)

    result = getProtocolSeries({ identifier: slug }) ?? result
  }

  if (!result) {
    return NextResponse.json({ ok: false, error: 'Protocol not found' }, { status: 404 })
  }

  const response = NextResponse.json({ ok: true, ...result })
  response.headers.set('Cache-Control', hasAnyData(result) ? CACHE_CONTROL_HEADER : 'no-store')
  if (ingestTriggered) {
    response.headers.set('x-ingest-triggered', 'true')
  }
  return response
}
