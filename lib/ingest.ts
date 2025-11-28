import type { Database as SqliteDatabase, RunResult } from 'better-sqlite3'
import { applySchema, getDb } from './db'
import { fetchFeesOverview, fetchProtocolSummary, type ChartPoint, type ChartPointValue, type MetricApiType, type OverviewProtocol } from './defillama'

export type NormalizedMetricType = 'fees' | 'revenue' | 'holders_revenue'
export type ProtocolFilter = {
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

type ProtocolRawRow = {
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

type ProtocolRow = Pick<ProtocolRawRow, 'name' | 'display_name' | 'logo' | 'slug'>

export type StoredProtocol = Pick<OverviewProtocol, 'name' | 'displayName' | 'logo' | 'slug'>

const defaultLogger = (message: string) => console.log(`[ingest] ${message}`)

export function protocolRowToStored(row: ProtocolRow): StoredProtocol {
  return {
    slug: row.slug,
    name: row.name ?? undefined,
    displayName: row.display_name ?? undefined,
    logo: row.logo ?? undefined,
  }
}

export function getTrackedProtocols(db: SqliteDatabase = getDb()): StoredProtocol[] {
  const rows = db
    .prepare(
      `
      SELECT
        p.slug,
        p.name,
        p.display_name,
        p.logo
      FROM tracked_protocols t
      JOIN protocols p ON p.slug = t.slug
    `
    )
    .all() as ProtocolRow[]

  return rows.map((row) => protocolRowToStored(row))
}

function ensureArray(value: string[] | undefined | null): string[] {
  if (!value) return []
  return value.filter((item) => typeof item === 'string' && item.trim().length > 0)
}

function extractParentSlug(parentProtocol?: string | null): string | null {
  if (!parentProtocol) return null
  const [, slugPart] = parentProtocol.split('#')
  return (slugPart || parentProtocol || '').trim() || null
}

function buildAggregatedProtocols(rawProtocols: OverviewProtocol[]): StoredProtocol[] {
  const byName = new Map<string, OverviewProtocol[]>()

  for (const protocol of rawProtocols) {
    if (!protocol.name) continue
    const key = protocol.name
    const list = byName.get(key) ?? []
    list.push(protocol)
    byName.set(key, list)
  }

  const aggregated = new Map<string, StoredProtocol>()

  for (const protocol of rawProtocols) {
    const parentSlug = extractParentSlug(protocol.parentProtocol)
    if (!parentSlug) {
      if (!aggregated.has(protocol.slug)) {
        aggregated.set(protocol.slug, {
          name: protocol.name,
          displayName: protocol.displayName,
          slug: protocol.slug,
          logo: protocol.logo,
        })
      }
      continue
    }
    if (aggregated.has(parentSlug)) {
      continue
    }

    const linked = ensureArray(protocol.linkedProtocols)

    // 当前 parentSlug 关联的所有 protocols
    const matched = linked.map((name) => byName.get(name)?.[0]).filter((item): item is OverviewProtocol => Boolean(item))

    const sourceProtocols = matched.length ? matched : [protocol]
    const base = sourceProtocols[0] ?? protocol
    const slug = parentSlug
    const name = linked[0]
    const displayName = linked[0]

    aggregated.set(slug, {
      slug,
      name,
      displayName,
      logo: base.logo ?? protocol.logo,
    })
  }

  return Array.from(aggregated.values())
}

function upsertRawProtocols(db: SqliteDatabase, protocols: OverviewProtocol[]): number {
  if (!protocols.length) return 0
  const statement = db.prepare(
    `
    INSERT INTO protocols_raw (
      defillama_id, slug, name, display_name, protocol_type, category, chains, logo,
      gecko_id, cmc_id, module, methodology_url, has_label_breakdown, parent_protocol, linked_protocols, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
      parent_protocol=excluded.parent_protocol,
      linked_protocols=excluded.linked_protocols,
      updated_at=CURRENT_TIMESTAMP
    ;
  `
  )

  const run = db.transaction((items: OverviewProtocol[]) => {
    let count = 0
    for (const protocol of items) {
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
        protocol.hasLabelBreakdown ? 1 : 0,
        protocol.parentProtocol ?? null,
        protocol.linkedProtocols ? JSON.stringify(ensureArray(protocol.linkedProtocols)) : null
      )
      count += 1
    }
    return count
  })

  return run(protocols)
}

function upsertProcessedProtocol(db: SqliteDatabase, protocol: StoredProtocol): string {
  const statement = db.prepare(
    `
    INSERT INTO protocols (
      slug, name, display_name, logo, updated_at
    )
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(slug) DO UPDATE SET
      slug=excluded.slug,
      name=excluded.name,
      display_name=excluded.display_name,
      logo=excluded.logo,
      updated_at=CURRENT_TIMESTAMP
    ;
  `
  )

  statement.run(protocol.slug, protocol.name ?? null, protocol.displayName ?? protocol.name ?? null, protocol.logo ?? null)

  const row = db.prepare('SELECT slug FROM protocols WHERE slug = ?').get(protocol.slug) as { slug: string } | undefined
  if (!row) {
    throw new Error(`Failed to fetch protocol row for ${protocol.slug}`)
  }
  return row.slug
}

function syncCatalogFromOverview(db: SqliteDatabase, protocols: OverviewProtocol[]): StoredProtocol[] {
  if (!protocols.length) return []
  upsertRawProtocols(db, protocols)
  const aggregated = buildAggregatedProtocols(protocols)
  const run = db.transaction((items: StoredProtocol[]) => {
    for (const protocol of items) {
      upsertProcessedProtocol(db, protocol)
    }
    return items
  })
  return run(aggregated)
}

function findProtocolBySlugOrId(slug: string, db: SqliteDatabase = getDb()): ProtocolRow | null {
  const row = db
    .prepare(
      `
      SELECT
        slug,
        name,
        display_name,
        logo
      FROM protocols
      WHERE slug= ?
      LIMIT 1
    `
    )
    .get(slug) as ProtocolRow | undefined
  return row ?? null
}

export async function addTrackedProtocolBySlug(slugOrId: string, db: SqliteDatabase = getDb()): Promise<{ created: boolean; slug: string; protocol: StoredProtocol }> {
  applySchema()
  let existing = findProtocolBySlugOrId(slugOrId, db)

  if (!existing) {
    const overview = await fetchFeesOverview()
    syncCatalogFromOverview(db, overview.protocols || [])
    existing = findProtocolBySlugOrId(slugOrId, db)
  }

  if (!existing) {
    throw new Error(`Protocol not found for slug/id: ${slugOrId}`)
  }

  const protocol = protocolRowToStored(existing)

  const res = db.prepare('INSERT INTO tracked_protocols (slug) VALUES (?) ON CONFLICT(slug) DO NOTHING').run(protocol.slug)

  return { created: res.changes > 0, slug: protocol.slug, protocol }
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

function getCursor(db: SqliteDatabase, slug: string, metric: NormalizedMetricType): string | null {
  const row = db.prepare('SELECT last_date as lastDate FROM ingest_cursors WHERE slug = ? AND metric_type = ?').get(slug, metric) as { lastDate: string | null } | undefined
  return row?.lastDate ?? null
}

function updateCursor(db: SqliteDatabase, slug: string, metric: NormalizedMetricType, lastDate: string): void {
  db.prepare(
    `
    INSERT INTO ingest_cursors (slug, metric_type, last_date)
    VALUES (?, ?, ?)
    ON CONFLICT(slug, metric_type) DO UPDATE SET last_date=excluded.last_date;
  `
  ).run(slug, metric, lastDate)
}

function insertMetricRows(db: SqliteDatabase, slug: string, metric: NormalizedMetricType, rows: MetricRow[]): { written: number; lastDate?: string } {
  if (!rows.length) {
    return { written: 0, lastDate: undefined }
  }

  const insert = db.prepare(
    `
    INSERT INTO protocol_metrics (slug, metric_type, date, value_usd, breakdown_json, source_ts, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(slug, metric_type, date) DO UPDATE SET
      value_usd=excluded.value_usd,
      breakdown_json=excluded.breakdown_json,
      source_ts=excluded.source_ts,
      updated_at=CURRENT_TIMESTAMP;
  `
  )

  const result = db.transaction((batch: MetricRow[]) => {
    let written = 0
    for (const row of batch) {
      const res: RunResult = insert.run(slug, metric, row.date, row.value, row.breakdown_json ?? null, row.source_ts ?? null)
      written += res.changes
    }
    return written
  })(rows)

  const lastDate = rows.reduce((latest, row) => (row.date > latest ? row.date : latest), '')
  return { written: result, lastDate }
}

async function processProtocolMetric(
  db: SqliteDatabase,
  protocol: StoredProtocol,
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

    const lastDate = getCursor(db, protocol.slug, metric)
    const cutoffDate = lastDate && BACKFILL_DAYS > 0 ? toDateString(Math.max(0, Math.floor((Date.parse(lastDate) - BACKFILL_DAYS * 24 * 3600 * 1000) / 1000))) : null

    const filtered = cutoffDate ? rows.filter((row) => row.date >= cutoffDate) : rows

    if (dryRun) {
      logger(`Dry-run: ${filtered.length} points prepared for ${protocol.slug} ${metric}`)
      return filtered.length
    }

    const { written, lastDate: newestDate } = insertMetricRows(db, protocol.slug, metric, filtered)

    if (newestDate) {
      updateCursor(db, protocol.slug, metric, newestDate)
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

function filterTracked(tracked: StoredProtocol[], filter?: ProtocolFilter): StoredProtocol[] {
  if (!filter) return tracked
  const slugSet = new Set((filter.slugs ?? []).map((s) => s.toLowerCase()))

  return tracked.filter((item) => {
    const slugMatch = slugSet.size ? slugSet.has(item.slug.toLowerCase()) : false
    return slugSet.size ? slugMatch : true
  })
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
        const written = await processProtocolMetric(db, item, metric, logger, errors, Boolean(options.dryRun))
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

export async function syncProtocolCatalog(options: { logger?: (msg: string) => void } = {}): Promise<{ protocolsSeen: number; rawProtocolsSeen: number }> {
  const logger = options.logger ?? defaultLogger
  applySchema()
  const db = getDb()
  const overview = await fetchFeesOverview()
  const protocols = overview.protocols || []
  const aggregated = syncCatalogFromOverview(db, protocols)
  logger(`Catalog sync finished, raw=${protocols.length}, processed=${aggregated.length}`)
  return { protocolsSeen: aggregated.length, rawProtocolsSeen: protocols.length }
}
