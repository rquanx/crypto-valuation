import type { Database as SqliteDatabase, RunResult } from 'better-sqlite3'
import { applySchema, getDb } from './db'
import { fetchFeesOverview, fetchProtocolSummary, type ChartPoint, type ChartPointValue, type MetricApiType, type OverviewProtocol } from './defillama'

export type NormalizedMetricType = 'fees' | 'revenue' | 'holders_revenue'
export type ProtocolFilter = {
  protocolIds?: number[]
  defillamaIds?: string[]
  slugs?: string[]
}

const METRIC_API_MAP: Record<NormalizedMetricType, MetricApiType> = {
  fees: 'dailyFees',
  revenue: 'dailyRevenue',
  holders_revenue: 'dailyHoldersRevenue',
}

const DEFAULT_METRICS: NormalizedMetricType[] = ['holders_revenue', 'revenue', 'fees']

const DEFAULT_CONCURRENCY = Number(process.env.INGEST_CONCURRENCY || 3)
const BACKFILL_DAYS = Number(process.env.INGEST_BACKFILL_DAYS || 5)

export interface IngestOptions {
  metricTypes?: NormalizedMetricType[]
  concurrency?: number
  dryRun?: boolean
  logger?: (message: string) => void
  protocolFilter?: ProtocolFilter
}

export interface IngestResult {
  protocolsProcessed: number
  pointsWritten: number
  errors: string[]
}

interface MetricRow {
  date: string
  value: number
  breakdown_json?: string
  source_ts?: number
}

type ProtocolRow = {
  protocol_id: number
  defillama_id: string
  slug: string
  name: string | null
  display_name: string | null
  protocol_type: string | null
  category: string | null
  chains: string | null
  logo: string | null
  gecko_id: string | null
  cmc_id: string | null
  module: string | null
  methodology_url: string | null
  has_label_breakdown: number | null
}

export interface TrackedProtocolRecord {
  protocolId: number
  protocol: OverviewProtocol
}

const defaultLogger = (message: string) => console.log(`[ingest] ${message}`)

function protocolRowToOverview(row: ProtocolRow): OverviewProtocol {
  return {
    defillamaId: row.defillama_id,
    slug: row.slug,
    name: row.name ?? undefined,
    displayName: row.display_name ?? undefined,
    protocolType: row.protocol_type ?? undefined,
    category: row.category ?? undefined,
    logo: row.logo ?? undefined,
    chains: row.chains ? (JSON.parse(row.chains) as string[]) : [],
    module: row.module ?? undefined,
    methodologyURL: row.methodology_url ?? undefined,
    gecko_id: row.gecko_id ?? undefined,
    cmcId: row.cmc_id ?? undefined,
    hasLabelBreakdown: row.has_label_breakdown === 1,
  }
}

export function getTrackedProtocols(db: SqliteDatabase = getDb()): TrackedProtocolRecord[] {
  const rows = db
    .prepare(
      `
      SELECT
        p.id as protocol_id,
        p.defillama_id,
        p.slug,
        p.name,
        p.display_name,
        p.protocol_type,
        p.category,
        p.chains,
        p.logo,
        p.gecko_id,
        p.cmc_id,
        p.module,
        p.methodology_url,
        p.has_label_breakdown
      FROM tracked_protocols t
      JOIN protocols p ON p.id = t.protocol_id
    `
    )
    .all() as ProtocolRow[]

  return rows.map((row) => ({
    protocolId: row.protocol_id,
    protocol: protocolRowToOverview(row),
  }))
}

function findProtocolBySlugOrId(slugOrId: string, db: SqliteDatabase = getDb()): ProtocolRow | null {
  const row = db
    .prepare(
      `
      SELECT
        id as protocol_id,
        defillama_id,
        slug,
        name,
        display_name,
        protocol_type,
        category,
        chains,
        logo,
        gecko_id,
        cmc_id,
        module,
        methodology_url,
        has_label_breakdown
      FROM protocols
      WHERE lower(slug) = lower(?) OR lower(defillama_id) = lower(?)
      LIMIT 1
    `
    )
    .get(slugOrId, slugOrId) as ProtocolRow | undefined
  return row ?? null
}

function filterTracked(tracked: TrackedProtocolRecord[], filter?: ProtocolFilter): TrackedProtocolRecord[] {
  if (!filter) return tracked
  const idSet = new Set(filter.protocolIds ?? [])
  const llamaSet = new Set((filter.defillamaIds ?? []).map((id) => id.toLowerCase()))
  const slugSet = new Set((filter.slugs ?? []).map((s) => s.toLowerCase()))

  return tracked.filter((item) => {
    const pidMatch = idSet.size ? idSet.has(item.protocolId) : false
    const llamaMatch = llamaSet.size ? llamaSet.has(item.protocol.defillamaId.toLowerCase()) : false
    const slugMatch = slugSet.size ? slugSet.has(item.protocol.slug.toLowerCase()) : false
    return idSet.size || llamaSet.size || slugSet.size ? pidMatch || llamaMatch || slugMatch : true
  })
}

export async function addTrackedProtocolBySlug(slugOrId: string, db: SqliteDatabase = getDb()): Promise<{ created: boolean; protocolId: number; protocol: OverviewProtocol }> {
  const existing = findProtocolBySlugOrId(slugOrId, db)
  let protocolId: number
  let protocol: OverviewProtocol

  if (existing) {
    protocolId = existing.protocol_id
    protocol = protocolRowToOverview(existing)
  } else {
    const overview = await fetchFeesOverview()
    const matched = overview.protocols.find((item) => item.slug.toLowerCase() === slugOrId.toLowerCase() || item.defillamaId.toLowerCase() === slugOrId.toLowerCase()) ?? null

    if (!matched) {
      throw new Error(`Protocol not found for slug/id: ${slugOrId}`)
    }

    protocolId = upsertProtocol(db, matched)
    protocol = matched
  }

  const res = db.prepare('INSERT INTO tracked_protocols (protocol_id) VALUES (?) ON CONFLICT(protocol_id) DO NOTHING').run(protocolId)

  return { created: res.changes > 0, protocolId, protocol }
}

function toDateString(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1000).toISOString().slice(0, 10)
}

function sumValue(value: ChartPointValue): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (value && typeof value === 'object') {
    return Object.values(value).reduce((acc, curr) => (acc || 0) + sumValue(curr as ChartPointValue), 0) || 0
  }

  return 0
}

function sumBreakdown(value: ChartPoint[1]): { total: number; breakdown?: string } | null {
  if (value == null) return null
  const total = sumValue(value)
  if (!Number.isFinite(total)) return null

  const breakdown = typeof value === 'object' && value !== null ? JSON.stringify(value) : undefined
  return { total, breakdown }
}

function chartToRows(points: ChartPoint[]): MetricRow[] {
  return points
    .map((point) => {
      const [timestamp, value] = point
      const totals = sumBreakdown(value)
      if (!totals) return null
      return {
        date: toDateString(timestamp),
        value: totals.total,
        breakdown_json: totals.breakdown,
        source_ts: timestamp,
      }
    })
    .filter((row) => Boolean(row && Number.isFinite(row.value))) as MetricRow[]
}

export function upsertProtocol(db: SqliteDatabase, protocol: OverviewProtocol): number {
  const statement = db.prepare(
    `
    INSERT INTO protocols (
      defillama_id, slug, name, display_name, protocol_type, category, chains, logo,
      gecko_id, cmc_id, module, methodology_url, has_label_breakdown, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(defillama_id) DO UPDATE SET
      slug=excluded.slug,
      name=excluded.name,
      display_name=excluded.display_name,
      protocol_type=excluded.protocol_type,
      category=excluded.category,
      chains=excluded.chains,
      logo=excluded.logo,
      gecko_id=excluded.gecko_id,
      cmc_id=excluded.cmc_id,
      module=excluded.module,
      methodology_url=excluded.methodology_url,
      has_label_breakdown=excluded.has_label_breakdown,
      updated_at=CURRENT_TIMESTAMP
    ;
  `
  )

  statement.run(
    protocol.defillamaId,
    protocol.slug,
    protocol.name ?? null,
    protocol.displayName ?? protocol.name ?? null,
    protocol.protocolType ?? null,
    protocol.category ?? null,
    JSON.stringify(protocol.chains ?? []),
    protocol.logo ?? null,
    protocol.gecko_id ?? null,
    protocol.cmcId ?? null,
    protocol.module ?? null,
    protocol.methodologyURL ?? null,
    protocol.hasLabelBreakdown ? 1 : 0
  )

  const row = db.prepare('SELECT id FROM protocols WHERE defillama_id = ?').get(protocol.defillamaId) as { id: number } | undefined
  if (!row) {
    throw new Error(`Failed to fetch protocol row for ${protocol.defillamaId}`)
  }
  return row.id
}

function getCursor(db: SqliteDatabase, protocolId: number, metric: NormalizedMetricType): string | null {
  const row = db.prepare('SELECT last_date as lastDate FROM ingest_cursors WHERE protocol_id = ? AND metric_type = ?').get(protocolId, metric) as { lastDate: string | null } | undefined
  return row?.lastDate ?? null
}

function updateCursor(db: SqliteDatabase, protocolId: number, metric: NormalizedMetricType, lastDate: string): void {
  db.prepare(
    `
    INSERT INTO ingest_cursors (protocol_id, metric_type, last_date)
    VALUES (?, ?, ?)
    ON CONFLICT(protocol_id, metric_type) DO UPDATE SET last_date=excluded.last_date;
  `
  ).run(protocolId, metric, lastDate)
}

function insertMetricRows(db: SqliteDatabase, protocolId: number, metric: NormalizedMetricType, rows: MetricRow[]): { written: number; lastDate?: string } {
  if (!rows.length) {
    return { written: 0, lastDate: undefined }
  }

  const insert = db.prepare(
    `
    INSERT INTO protocol_metrics (protocol_id, metric_type, date, value_usd, breakdown_json, source_ts, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(protocol_id, metric_type, date) DO UPDATE SET
      value_usd=excluded.value_usd,
      breakdown_json=excluded.breakdown_json,
      source_ts=excluded.source_ts,
      updated_at=CURRENT_TIMESTAMP;
  `
  )

  const result = db.transaction((batch: MetricRow[]) => {
    let written = 0
    for (const row of batch) {
      const res: RunResult = insert.run(protocolId, metric, row.date, row.value, row.breakdown_json ?? null, row.source_ts ?? null)
      written += res.changes
    }
    return written
  })(rows)

  const lastDate = rows.reduce((latest, row) => (row.date > latest ? row.date : latest), '')
  return { written: result, lastDate }
}

async function processProtocolMetric(
  db: SqliteDatabase,
  protocol: OverviewProtocol,
  protocolId: number,
  metric: NormalizedMetricType,
  logger: (message: string) => void,
  errors: string[],
  dryRun: boolean
): Promise<number> {
  const apiMetric = METRIC_API_MAP[metric]
  try {
    const summary = await fetchProtocolSummary(protocol.slug, apiMetric)
    const rows = chartToRows(summary.totalDataChart || [])
    if (!rows.length) {
      logger(`No data points for ${protocol.slug} metric ${metric}; skipping persistence`)
      return 0
    }

    const lastDate = getCursor(db, protocolId, metric)
    const cutoffDate = lastDate && BACKFILL_DAYS > 0 ? toDateString(Math.max(0, Math.floor((Date.parse(lastDate) - BACKFILL_DAYS * 24 * 3600 * 1000) / 1000))) : null

    const filtered = cutoffDate ? rows.filter((row) => row.date >= cutoffDate) : rows

    if (dryRun) {
      logger(`Dry-run: ${filtered.length} points prepared for ${protocol.slug} ${metric}`)
      return filtered.length
    }

    const { written, lastDate: newestDate } = insertMetricRows(db, protocolId, metric, filtered)

    if (newestDate) {
      updateCursor(db, protocolId, metric, newestDate)
    }
    if (summary.hasLabelBreakdown) {
      db.prepare('UPDATE protocols SET has_label_breakdown = 1 WHERE id = ?').run(protocolId)
    }

    return written
  } catch (error) {
    const message = `Failed to ingest ${metric} for ${protocol.slug}: ${(error as Error).message}`
    logger(message)
    errors.push(message)
    return 0
  }
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  const actualLimit = Math.max(1, Math.min(limit, items.length || 1))
  let index = 0
  const runners = Array.from({ length: actualLimit }, async () => {
    while (true) {
      const current = index++
      if (current >= items.length) break
      await worker(items[current])
    }
  })
  await Promise.all(runners)
}

export async function ingestDefillama(options: IngestOptions = {}): Promise<IngestResult> {
  const metricTypes = options.metricTypes ?? DEFAULT_METRICS
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
  const logger = options.logger ?? defaultLogger

  applySchema()
  const db = getDb()

  const runId = db.prepare("INSERT INTO ingest_runs (run_at, status, note, items_fetched) VALUES (CURRENT_TIMESTAMP, 'running', NULL, 0)").run().lastInsertRowid as number

  try {
    const tracked = filterTracked(getTrackedProtocols(db), options.protocolFilter)
    if (!tracked.length) {
      db.prepare("UPDATE ingest_runs SET status = 'skipped_no_tracked', note = 'No tracked protocols', items_fetched = 0 WHERE id = ?").run(runId)
      return { protocolsProcessed: 0, pointsWritten: 0, errors: [] }
    }

    let protocolsProcessed = 0
    let pointsWritten = 0
    const errors: string[] = []

    await runWithConcurrency(tracked, concurrency, async (item) => {
      protocolsProcessed += 1

      for (const metric of metricTypes) {
        const written = await processProtocolMetric(db, item.protocol, item.protocolId, metric, logger, errors, Boolean(options.dryRun))
        pointsWritten += written
      }
    })

    const status = errors.length > 0 ? 'success_with_errors' : 'success'
    const noteBase = options.dryRun ? 'Dry run' : 'Completed'
    const note = errors.length > 0 ? `${noteBase} with ${errors.length} errors` : `${noteBase} successfully`

    db.prepare('UPDATE ingest_runs SET status = ?, note = ?, items_fetched = ? WHERE id = ?').run(status, note, pointsWritten, runId)

    return { protocolsProcessed, pointsWritten, errors }
  } catch (error) {
    const message = (error as Error).message
    db.prepare("UPDATE ingest_runs SET status = 'failed', note = ? WHERE id = ?").run(message.slice(0, 500), runId)
    throw error
  }
}

export async function syncProtocolCatalog(options: { logger?: (msg: string) => void } = {}): Promise<{ protocolsSeen: number }> {
  const logger = options.logger ?? defaultLogger
  applySchema()
  const db = getDb()
  const overview = await fetchFeesOverview()
  const protocols = overview.protocols || []
  let seen = 0
  for (const protocol of protocols) {
    upsertProtocol(db, protocol)
    seen += 1
  }
  logger(`Catalog sync finished, protocols=${seen}`)
  return { protocolsSeen: seen }
}
