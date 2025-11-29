import { NextRequest, NextResponse } from 'next/server'
import { authorizeRequest } from '@/lib/api'
import { pruneInactiveTracked, syncProtocolCatalog } from '@/lib/ingest'
import { triggerIngestNow } from '@/lib/scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SchedulerJob = 'ingest' | 'catalog' | 'prune'

function parseJob(request: NextRequest, payload?: { job?: string | null }): SchedulerJob {
  const job = payload?.job ?? request.nextUrl.searchParams.get('job') ?? 'ingest'
  if (job === 'catalog') return 'catalog'
  if (job === 'prune') return 'prune'
  return 'ingest'
}

async function handleRequest(request: NextRequest, payload?: { job?: string | null }) {
  if (!authorizeRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const job = parseJob(request, payload)

  try {
    if (job === 'catalog') {
      const result = await syncProtocolCatalog()
      return NextResponse.json({ ok: true, job, result })
    }

    if (job === 'prune') {
      const result = pruneInactiveTracked({ logger: (msg) => console.log(`[scheduler-api] ${msg}`) })
      return NextResponse.json({ ok: true, job, result })
    }

    const result = await triggerIngestNow('scheduler-api')
    if (!result) {
      return NextResponse.json({ ok: false, message: 'Ingest already running' }, { status: 429 })
    }

    return NextResponse.json({ ok: true, job, ...result })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message, job },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request)
}

export async function POST(request: NextRequest) {
  let payload: { job?: string | null } | undefined
  try {
    payload = await request.json()
  } catch {
    payload = undefined
  }

  return handleRequest(request, payload)
}
