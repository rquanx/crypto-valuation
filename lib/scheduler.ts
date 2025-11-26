import cron, { type ScheduledTask } from 'node-cron'
import { ingestDefillama, type IngestResult, type NormalizedMetricType, type ProtocolFilter } from './ingest'
import { syncProtocolCatalog } from './ingest'

const CRON_SCHEDULE = process.env.INGEST_CRON || '10 1 * * *' // 01:10 UTC daily
const CATALOG_CRON = process.env.CATALOG_CRON || '0 2 * * *'
const RUN_ON_BOOT = process.env.INGEST_RUN_ON_BOOT !== 'false'
const DISABLE_SCHEDULER = process.env.DISABLE_INGEST_SCHEDULER === 'true'

type SchedulerState = {
  job?: ScheduledTask
  catalogJob?: ScheduledTask
  running: boolean
}

declare global {
  var __ingestSchedulerState: SchedulerState | undefined
}

function getState(): SchedulerState {
  if (!global.__ingestSchedulerState) {
    global.__ingestSchedulerState = { running: false }
  }
  return global.__ingestSchedulerState
}

export async function triggerIngestNow(
  reason = 'manual',
  options?: {
    metricTypes?: NormalizedMetricType[]
    dryRun?: boolean
    protocolFilter?: ProtocolFilter
  }
): Promise<IngestResult | null> {
  const state = getState()
  if (state.running) {
    console.log(`[scheduler] Ingest already running; skip trigger (${reason})`)
    return null
  }

  state.running = true
  const startedAt = Date.now()
  try {
    console.log(`[scheduler] Starting ingest (${reason})`)
    const result = await ingestDefillama({
      metricTypes: options?.metricTypes,
      dryRun: options?.dryRun,
      protocolFilter: options?.protocolFilter,
      logger: (msg) => console.log(msg),
    })
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
    console.log(`[scheduler] Ingest finished in ${elapsed}s (protocols=${result.protocolsProcessed}, points=${result.pointsWritten}, errors=${result.errors.length})`)
    if (result.errors.length) {
      console.error(`[scheduler] Errors (${result.errors.length}): ${result.errors.slice(0, 3).join(' | ')}`)
    }
    return result
  } catch (error) {
    console.error(`[scheduler] Ingest failed (${reason}):`, error)
    return null
  } finally {
    state.running = false
  }
}

export function startIngestScheduler(): void {
  const state = getState()
  if (DISABLE_SCHEDULER) {
    console.log('[scheduler] Scheduler disabled via DISABLE_INGEST_SCHEDULER')
    return
  }

  if (!state.catalogJob) {
    if (!cron.validate(CATALOG_CRON)) {
      console.error(`[scheduler] Invalid catalog cron expression "${CATALOG_CRON}", catalog sync not started`)
    } else {
      state.catalogJob = cron.schedule(
        CATALOG_CRON,
        () => {
          void syncProtocolCatalog().catch((err) => console.error('[scheduler] Catalog sync failed', err))
        },
        { timezone: 'UTC' }
      )
      console.log(`[scheduler] Catalog cron started (${CATALOG_CRON} UTC)`)
    }
  }

  if (!state.job) {
    if (!cron.validate(CRON_SCHEDULE)) {
      console.error(`[scheduler] Invalid cron expression "${CRON_SCHEDULE}", scheduler not started`)
      return
    }

    state.job = cron.schedule(
      CRON_SCHEDULE,
      () => {
        void triggerIngestNow('cron')
      },
      { timezone: 'UTC' }
    )
    console.log(`[scheduler] Cron started (${CRON_SCHEDULE} UTC)`)
  }

  if (RUN_ON_BOOT) {
    void syncProtocolCatalog().catch((err) => console.error('[scheduler] Catalog sync failed', err))
    void triggerIngestNow('startup')
  }
}
