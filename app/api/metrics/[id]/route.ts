import { NextRequest, NextResponse } from 'next/server'
import { API_CACHE_CONTROL_HEADER, API_CACHE_TTL_SECONDS } from '@/lib/api'
import { addTrackedProtocolBySlug, isProtocolTracked, touchTracked, type NormalizedMetricType } from '@/lib/ingest'
import { getProtocolSeries } from '@/lib/queries'
import { triggerIngestNow } from '@/lib/scheduler'

export const runtime = 'nodejs'
export const revalidate = API_CACHE_TTL_SECONDS

function hasAnyData(result: { available: Record<NormalizedMetricType, number> }): boolean {
  return Object.values(result.available).some((count) => count > 0)
}

export async function GET(_request: NextRequest, context: RouteContext<'/api/metrics/[id]'>) {
  const { id } = await context.params

  let result = getProtocolSeries({ identifier: id })
  let slug = result?.protocol.slug ?? id
  let ingestTriggered = false

  // If we have no protocol or no data, try to add/track it and fetch fresh data once.
  if (!result || !hasAnyData(result) || !isProtocolTracked(slug)) {
    try {
      const tracked = await addTrackedProtocolBySlug(slug)
      slug = tracked.slug
    } catch {
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

  touchTracked([result.protocol.slug])

  const response = NextResponse.json({ ok: true, ...result })
  response.headers.set('Cache-Control', hasAnyData(result) ? API_CACHE_CONTROL_HEADER : 'no-store')
  if (ingestTriggered) {
    response.headers.set('x-ingest-triggered', 'true')
  }
  return response
}
