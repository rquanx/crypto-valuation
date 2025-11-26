import { NextRequest, NextResponse } from 'next/server'
import { syncProtocolCatalog } from '@/lib/ingest'
import { triggerIngestNow } from '@/lib/scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SchedulerJob = 'ingest' | 'catalog'

function authorize(request: NextRequest): boolean {
  const secret = process.env.INGEST_SECRET
  if (!secret) return true

  const headerToken = request.headers.get('x-ingest-secret')
  const queryToken = request.nextUrl.searchParams.get('token')
  return headerToken === secret || queryToken === secret
}

function parseJob(request: NextRequest, payload?: { job?: string | null }): SchedulerJob {
  const job = payload?.job ?? request.nextUrl.searchParams.get('job') ?? 'ingest'
  return job === 'catalog' ? 'catalog' : 'ingest'
}

async function handleRequest(request: NextRequest, payload?: { job?: string | null }) {
  if (!authorize(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const job = parseJob(request, payload)

  try {
    if (job === 'catalog') {
      const result = await syncProtocolCatalog()
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
