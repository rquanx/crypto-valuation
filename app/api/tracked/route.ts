import { NextRequest, NextResponse } from 'next/server'
import { parseMetricTypes, parseStringList } from '@/lib/api'
import { addTrackedProtocolBySlug, getTrackedProtocols, type ProtocolFilter } from '@/lib/ingest'
import { triggerIngestNow } from '@/lib/scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function parseProtocolFilter(request: NextRequest): ProtocolFilter | undefined {
  const slugs = parseStringList(request.nextUrl.searchParams.get('slug'))
  return slugs?.length ? { slugs } : undefined
}
export async function GET(request: NextRequest) {
  const filter = parseProtocolFilter(request)
  const items = getTrackedProtocols().filter((item) => {
    if (!filter) return true
    return filter.slugs?.some((slug) => slug.toLowerCase() === item.slug.toLowerCase()) ?? false
  })

  return NextResponse.json({ items })
}
export async function POST(request: NextRequest) {
  let payload: { slug?: string; metrics?: string } | null = null
  try {
    payload = await request.json()
  } catch {
    payload = null
  }

  const slugOrId = payload?.slug || request.nextUrl.searchParams.get('slug')

  if (!slugOrId) {
    return NextResponse.json({ error: 'Missing slug or defillamaId' }, { status: 400 })
  }

  try {
    const { created, slug, protocol } = await addTrackedProtocolBySlug(slugOrId)
    const metricTypes = parseMetricTypes(request.nextUrl.searchParams.get('metrics') ?? payload?.metrics ?? null)

    let ingestResult = null
    if (created) {
      ingestResult = await triggerIngestNow('tracked-add', {
        metricTypes,
        protocolFilter: { slugs: [slug] },
      })
    }

    return NextResponse.json({
      ok: true,
      created,
      slug,
      protocol,
      ingest: ingestResult,
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 404 })
  }
}
