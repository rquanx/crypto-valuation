import { type ScheduledTask } from 'node-cron'
import { ingestDefillama, type IngestResult, type NormalizedMetricType, type ProtocolFilter } from './ingest'

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
