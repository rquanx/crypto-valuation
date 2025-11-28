import { NextRequest, NextResponse } from 'next/server'
import { authorizeRequest, parseMetricTypes, parseStringList } from '@/lib/api'
import { ingestDefillama } from '@/lib/ingest'
import { triggerIngestNow } from '@/lib/scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 提供外部触发数据同步能力
export async function POST(request: NextRequest) {
  if (!authorizeRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params = request.nextUrl.searchParams
  const metricTypes = parseMetricTypes(params.get('metrics'))
  const dryRun = params.get('dryRun') === 'true'
  const useDirect = params.get('useDirect') === 'true'
  const protocolFilter = {
    slugs: parseStringList(params.get('slugs')),
  }

  // Allow bypassing the scheduler mutex when needed.
  if (useDirect) {
    const result = await ingestDefillama({
      metricTypes,
      dryRun,
      protocolFilter,
      logger: (msg) => console.log(msg),
    })
    return NextResponse.json({ ok: true, ...result })
  }

  const result = await triggerIngestNow('api', { metricTypes, dryRun, protocolFilter })
  if (!result) {
    return NextResponse.json({ ok: false, message: 'Ingest already running' }, { status: 429 })
  }

  return NextResponse.json({ ok: true, ...result })
}
