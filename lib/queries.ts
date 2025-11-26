import type { Database as SqliteDatabase } from 'better-sqlite3'
import { getDb } from './db'
import type { NormalizedMetricType } from './ingest'

export type MetricPreference = 'auto' | NormalizedMetricType

export type ProtocolSummary = {
  id: number
  defillamaId: string
  slug: string
  name: string | null
  displayName: string | null
  protocolType: string | null
  category: string | null
  chains: string[]
  logo: string | null
  hasLabelBreakdown: boolean
}

export type TokenAggregate = {
  protocol: ProtocolSummary
  metricUsed: NormalizedMetricType | null
  metricUsedWindows: Record<number, NormalizedMetricType | null>
  windows: Record<number, number | null>
  coverage: Record<NormalizedMetricType, boolean>
  latestByMetric: Partial<Record<NormalizedMetricType, string | null>>
}

export type TokenAggregateResponse = {
  windows: number[]
  metricPreference: MetricPreference
  items: TokenAggregate[]
}

export type CoverageItem = ProtocolSummary & {
  coverage: Record<NormalizedMetricType, boolean>
  latestByMetric: Partial<Record<NormalizedMetricType, string | null>>
}

const DEFAULT_WINDOWS = [1, 7, 30, 90, 365]
const METRIC_ORDER: Record<MetricPreference, NormalizedMetricType[]> = {
  auto: ['holders_revenue', 'revenue', 'fees'],
  holders_revenue: ['holders_revenue', 'revenue', 'fees'],
  revenue: ['revenue', 'holders_revenue', 'fees'],
  fees: ['fees', 'revenue', 'holders_revenue'],
}

type ProtocolRow = {
  id: number
  defillama_id: string
  slug: string
  name: string | null
  display_name: string | null
  protocol_type: string | null
  category: string | null
  chains: string | null
  logo: string | null
  has_label_breakdown: number | null
}

type CoverageRow = {
  protocol_id: number
  metric_type: NormalizedMetricType
  latest_date: string | null
  rows: number
}

type AggregateRow = {
  protocol_id: number
  metric_type: NormalizedMetricType
  total: number | null
}

function toDateStringFromWindow(days: number): string {
  const now = new Date()
  now.setUTCHours(0, 0, 0, 0)
  now.setUTCDate(now.getUTCDate() - Math.max(0, days - 1))
  return now.toISOString().slice(0, 10)
}

function rowToProtocol(row: ProtocolRow): ProtocolSummary {
  return {
    id: row.id,
    defillamaId: row.defillama_id,
    slug: row.slug,
    name: row.name,
    displayName: row.display_name,
    protocolType: row.protocol_type,
    category: row.category,
    chains: row.chains ? (JSON.parse(row.chains) as string[]) : [],
    logo: row.logo,
    hasLabelBreakdown: row.has_label_breakdown === 1,
  }
}

function buildProtocolWhere(options: { search?: string | null; chain?: string | null; ids?: number[]; slugs?: string[]; defillamaIds?: string[] }): { where: string; params: Array<string | number> } {
  const clauses: string[] = []
  const params: Array<string | number> = []

  if (options.search) {
    const term = `%${options.search.toLowerCase()}%`
    clauses.push('(lower(p.name) LIKE ? OR lower(p.display_name) LIKE ? OR lower(p.slug) LIKE ? OR lower(p.defillama_id) LIKE ?)')
    params.push(term, term, term, term)
  }

  if (options.chain) {
    clauses.push('p.chains LIKE ?')
    params.push(`%${options.chain}%`)
  }

  if (options.ids && options.ids.length) {
    clauses.push(`p.id IN (${options.ids.map(() => '?').join(',')})`)
    params.push(...options.ids)
  }

  if (options.slugs && options.slugs.length) {
    clauses.push(`lower(p.slug) IN (${options.slugs.map(() => '?').join(',')})`)
    params.push(...options.slugs.map((s) => s.toLowerCase()))
  }

  if (options.defillamaIds && options.defillamaIds.length) {
    clauses.push(`lower(p.defillama_id) IN (${options.defillamaIds.map(() => '?').join(',')})`)
    params.push(...options.defillamaIds.map((s) => s.toLowerCase()))
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return { where, params }
}

export function findProtocol(identifier: string, db: SqliteDatabase = getDb()): ProtocolSummary | null {
  const row = db
    .prepare(
      `
      SELECT id, defillama_id, slug, name, display_name, protocol_type, category, chains, logo, has_label_breakdown
      FROM protocols p
      WHERE p.id = ? OR lower(p.slug) = lower(?) OR lower(p.defillama_id) = lower(?)
      LIMIT 1
    `
    )
    .get(identifier, identifier, identifier) as ProtocolRow | undefined

  return row ? rowToProtocol(row) : null
}

export function listProtocols(
  options: {
    search?: string | null
    chain?: string | null
    limit?: number
    trackedOnly?: boolean
    ids?: number[]
    slugs?: string[]
    defillamaIds?: string[]
  },
  db: SqliteDatabase = getDb()
): ProtocolSummary[] {
  const limit = Math.max(1, Math.min(options.limit ?? 200, 500))
  const { where, params } = buildProtocolWhere({
    search: options.search,
    chain: options.chain,
    ids: options.ids,
    slugs: options.slugs,
    defillamaIds: options.defillamaIds,
  })

  const joinTracked = options.trackedOnly !== false ? 'JOIN tracked_protocols t ON t.protocol_id = p.id' : ''
  const sql = `
    SELECT p.id, p.defillama_id, p.slug, p.name, p.display_name, p.protocol_type, p.category, p.chains, p.logo, p.has_label_breakdown
    FROM protocols p
    ${joinTracked}
    ${where}
    ORDER BY p.display_name IS NULL, p.display_name ASC
    LIMIT ?
  `

  const rows = db.prepare(sql).all(...params, limit) as ProtocolRow[]
  return rows.map(rowToProtocol)
}

function buildCoverage(
  protocolIds: number[],
  db: SqliteDatabase
): {
  coverageByProtocol: Map<number, Record<NormalizedMetricType, boolean>>
  latestByProtocol: Map<number, Partial<Record<NormalizedMetricType, string | null>>>
} {
  if (!protocolIds.length) {
    return { coverageByProtocol: new Map(), latestByProtocol: new Map() }
  }

  const placeholders = protocolIds.map(() => '?').join(',')
  const rows = db
    .prepare(
      `
      SELECT protocol_id, metric_type, MAX(date) as latest_date, COUNT(1) as rows
      FROM protocol_metrics
      WHERE protocol_id IN (${placeholders})
      GROUP BY protocol_id, metric_type
    `
    )
    .all(...protocolIds) as CoverageRow[]

  const coverageByProtocol = new Map<number, Record<NormalizedMetricType, boolean>>()
  const latestByProtocol = new Map<number, Partial<Record<NormalizedMetricType, string | null>>>()

  for (const row of rows) {
    if (!coverageByProtocol.has(row.protocol_id)) {
      coverageByProtocol.set(row.protocol_id, { fees: false, revenue: false, holders_revenue: false })
    }
    if (!latestByProtocol.has(row.protocol_id)) {
      latestByProtocol.set(row.protocol_id, {})
    }

    const coverage = coverageByProtocol.get(row.protocol_id)!
    coverage[row.metric_type] = row.rows > 0
    const latest = latestByProtocol.get(row.protocol_id)!
    latest[row.metric_type] = row.latest_date
  }

  return { coverageByProtocol, latestByProtocol }
}

function aggregateTotals(protocolIds: number[], windows: number[], db: SqliteDatabase): Map<number, Map<number, Record<NormalizedMetricType, number>>> {
  const result = new Map<number, Map<number, Record<NormalizedMetricType, number>>>()
  if (!protocolIds.length) return result

  const placeholders = protocolIds.map(() => '?').join(',')

  for (const window of windows) {
    const since = toDateStringFromWindow(window)
    const rows = db
      .prepare(
        `
        SELECT protocol_id, metric_type, SUM(value_usd) as total
        FROM protocol_metrics
        WHERE protocol_id IN (${placeholders}) AND date >= ?
        GROUP BY protocol_id, metric_type
      `
      )
      .all(...protocolIds, since) as AggregateRow[]

    for (const row of rows) {
      if (!result.has(window)) {
        result.set(window, new Map())
      }
      const windowMap = result.get(window)!
      if (!windowMap.has(row.protocol_id)) {
        windowMap.set(row.protocol_id, { fees: 0, revenue: 0, holders_revenue: 0 })
      }
      const metrics = windowMap.get(row.protocol_id)!
      metrics[row.metric_type] = Number(row.total ?? 0)
    }
  }

  return result
}

function chooseMetric(preference: MetricPreference, coverage: Record<NormalizedMetricType, boolean>, totals: Record<NormalizedMetricType, number | undefined>): NormalizedMetricType | null {
  const order = METRIC_ORDER[preference]
  for (const metric of order) {
    if (coverage[metric] && totals[metric] !== undefined) {
      return metric
    }
  }
  // If no coverage, still fall back to the first metric with any total value
  for (const metric of order) {
    if (totals[metric] !== undefined) return metric
  }
  return null
}

export function getTokenAggregates(
  options: {
    metricPreference?: MetricPreference
    windows?: number[]
    search?: string | null
    chain?: string | null
    ids?: number[]
    slugs?: string[]
    defillamaIds?: string[]
  },
  db: SqliteDatabase = getDb()
): TokenAggregateResponse {
  const metricPreference = options.metricPreference ?? 'auto'
  const windows = (options.windows && options.windows.length ? options.windows : DEFAULT_WINDOWS).map((value) => Number(value)).filter((value) => DEFAULT_WINDOWS.includes(value))
  const uniqueWindows = Array.from(new Set(windows.length ? windows : DEFAULT_WINDOWS)).sort((a, b) => a - b)

  const protocols = listProtocols(
    {
      search: options.search,
      chain: options.chain,
      ids: options.ids,
      slugs: options.slugs,
      defillamaIds: options.defillamaIds,
      trackedOnly: true,
    },
    db
  )

  const protocolIds = protocols.map((p) => p.id)
  const { coverageByProtocol, latestByProtocol } = buildCoverage(protocolIds, db)
  const totals = aggregateTotals(protocolIds, uniqueWindows, db)

  const items: TokenAggregate[] = protocols.map((protocol) => {
    const coverage = coverageByProtocol.get(protocol.id) ?? { fees: false, revenue: false, holders_revenue: false }
    const latest = latestByProtocol.get(protocol.id) ?? {}
    const metricUsedWindows: Record<number, NormalizedMetricType | null> = {}
    const windowsTotals: Record<number, number | null> = {}

    for (const window of uniqueWindows) {
      const windowMap = totals.get(window)
      const totalsForProtocol = (windowMap?.get(protocol.id) ?? {}) as Record<NormalizedMetricType, number | undefined>
      const chosen = chooseMetric(metricPreference, coverage, totalsForProtocol)
      metricUsedWindows[window] = chosen
      windowsTotals[window] = chosen ? totalsForProtocol[chosen] ?? null : null
    }

    const metricUsed = Object.values(metricUsedWindows).find((metric) => metric !== null) ?? null

    return {
      protocol,
      metricUsed,
      metricUsedWindows,
      windows: windowsTotals,
      coverage,
      latestByMetric: latest,
    }
  })

  return { windows: uniqueWindows, metricPreference, items }
}

export function getCoverageList(
  options: {
    search?: string | null
    chain?: string | null
    limit?: number
    ids?: number[]
    slugs?: string[]
    defillamaIds?: string[]
    trackedOnly?: boolean
  },
  db: SqliteDatabase = getDb()
): CoverageItem[] {
  const protocols = listProtocols(
    {
      search: options.search,
      chain: options.chain,
      limit: options.limit,
      ids: options.ids,
      slugs: options.slugs,
      defillamaIds: options.defillamaIds,
      trackedOnly: options.trackedOnly,
    },
    db
  )

  const protocolIds = protocols.map((p) => p.id)
  const { coverageByProtocol, latestByProtocol } = buildCoverage(protocolIds, db)

  return protocols.map((protocol) => ({
    ...protocol,
    coverage: coverageByProtocol.get(protocol.id) ?? { fees: false, revenue: false, holders_revenue: false },
    latestByMetric: latestByProtocol.get(protocol.id) ?? {},
  }))
}

export function getProtocolSeries(
  options: {
    identifier: string
  },
  db: SqliteDatabase = getDb()
): {
  protocol: ProtocolSummary
  available: Record<NormalizedMetricType, number>
  latestByMetric: Partial<Record<NormalizedMetricType, string | null>>
  pointsByMetric: Partial<Record<NormalizedMetricType, { date: string; value: number }[]>>
} | null {
  const protocol = findProtocol(options.identifier, db)
  if (!protocol) return null

  const rows = db
    .prepare(
      `
      SELECT date, value_usd as value, metric_type
      FROM protocol_metrics
      WHERE protocol_id = ?
      ORDER BY date ASC
    `
    )
    .all(protocol.id) as { date: string; value: number; metric_type: NormalizedMetricType }[]

  const available: Record<NormalizedMetricType, number> = { fees: 0, revenue: 0, holders_revenue: 0 }
  const latestByMetric: Partial<Record<NormalizedMetricType, string | null>> = {}
  const pointsByMetric: Partial<Record<NormalizedMetricType, { date: string; value: number }[]>> = {}

  for (const row of rows) {
    available[row.metric_type] += 1
    latestByMetric[row.metric_type] = row.date
    if (!pointsByMetric[row.metric_type]) pointsByMetric[row.metric_type] = []
    pointsByMetric[row.metric_type]!.push({ date: row.date, value: row.value })
  }

  return { protocol, available, latestByMetric, pointsByMetric }
}

export function parseWindowParam(input: string | null | undefined): number[] {
  if (!input) return DEFAULT_WINDOWS
  const parsed = input
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && DEFAULT_WINDOWS.includes(v))
  return parsed.length ? Array.from(new Set(parsed)).sort((a, b) => a - b) : DEFAULT_WINDOWS
}
