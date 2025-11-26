import cron, { type ScheduledTask } from 'node-cron'

export const runtime = 'nodejs'

const CRON_SCHEDULE = process.env.INGEST_CRON || '10 1 * * *' // 01:10 UTC daily
const CATALOG_CRON = process.env.CATALOG_CRON || '0 2 * * *'
const RUN_ON_BOOT = process.env.INGEST_RUN_ON_BOOT !== 'false'
const DISABLE_SCHEDULER = process.env.DISABLE_INGEST_SCHEDULER === 'true'

type SchedulerJob = 'ingest' | 'catalog'

type SchedulerState = {
  ingestJob?: ScheduledTask
  catalogJob?: ScheduledTask
  initialized?: boolean
  baseUrl?: string
}

declare global {
  var __cronRequestScheduler: SchedulerState | undefined
}

function getState(): SchedulerState {
  if (!global.__cronRequestScheduler) {
    global.__cronRequestScheduler = {}
  }
  return global.__cronRequestScheduler
}

function resolveBaseUrl(): string {
  const explicit =
    process.env.SCHEDULER_BASE_URL ||
    process.env.SCHEDULER_URL ||
    process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) {
    return explicit.replace(/\/$/, '')
  }

  if (process.env.VERCEL_URL) {
    const host = process.env.VERCEL_URL.replace(/\/$/, '')
    return host.startsWith('http') ? host : `https://${host}`
  }

  return 'http://localhost:3000'
}

async function callScheduler(job: SchedulerJob) {
  const baseUrl = getState().baseUrl || resolveBaseUrl()
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (process.env.INGEST_SECRET) {
    headers['x-ingest-secret'] = process.env.INGEST_SECRET
  }

  const url = `${baseUrl}/api/scheduler?job=${job}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ job }),
      cache: 'no-store',
    })
    if (!res.ok) {
      const body = await res.text()
      console.error(`[scheduler-cron] Failed request (${job}): ${res.status} ${body}`)
    } else {
      console.log(`[scheduler-cron] Triggered ${job} via ${url}`)
    }
  } catch (error) {
    console.error(`[scheduler-cron] Error triggering ${job} via ${url}:`, error)
  }
}

function startCronRequests(): void {
  const state = getState()
  if (state.initialized) return
  state.initialized = true

  if (DISABLE_SCHEDULER) {
    console.log('[scheduler-cron] Scheduler disabled via DISABLE_INGEST_SCHEDULER')
    return
  }

  state.baseUrl = resolveBaseUrl()

  if (!cron.validate(CATALOG_CRON)) {
    console.error(`[scheduler-cron] Invalid catalog cron expression "${CATALOG_CRON}", catalog sync not started`)
  } else {
    state.catalogJob = cron.schedule(
      CATALOG_CRON,
      () => {
        void callScheduler('catalog')
      },
      { timezone: 'UTC' }
    )
    console.log(`[scheduler-cron] Catalog cron started (${CATALOG_CRON} UTC) -> ${state.baseUrl}`)
  }

  if (!cron.validate(CRON_SCHEDULE)) {
    console.error(`[scheduler-cron] Invalid cron expression "${CRON_SCHEDULE}", ingest not started`)
  } else {
    state.ingestJob = cron.schedule(
      CRON_SCHEDULE,
      () => {
        void callScheduler('ingest')
      },
      { timezone: 'UTC' }
    )
    console.log(`[scheduler-cron] Ingest cron started (${CRON_SCHEDULE} UTC) -> ${state.baseUrl}`)
  }

  if (RUN_ON_BOOT) {
    void callScheduler('catalog')
    void callScheduler('ingest')
  }
}

export async function register() {
  startCronRequests()
}
