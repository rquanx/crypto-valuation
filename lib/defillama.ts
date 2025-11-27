const API_BASE = process.env.DEFILLAMA_API_BASE || 'https://api.llama.fi'
const MAX_REQUESTS_PER_MIN = Math.min(200, Math.max(10, Number(process.env.DEFILLAMA_MAX_REQUESTS_PER_MIN ?? 90)))
const REQUEST_INTERVAL_MS = Math.floor(60000 / MAX_REQUESTS_PER_MIN)

export type MetricApiType = 'dailyFees' | 'dailyRevenue' | 'dailyHoldersRevenue'

export interface OverviewProtocol {
  defillamaId: string
  slug: string
  name?: string
  displayName?: string
  protocolType?: string
  category?: string
  logo?: string
  chains?: string[]
  module?: string
  methodologyURL?: string
  gecko_id?: string
  cmcId?: string
  hasLabelBreakdown?: boolean
  parentProtocol?: string
  linkedProtocols?: string[]
}

export interface OverviewResponse {
  protocols: OverviewProtocol[]
}

export type ChartPointValue = number | Record<string, number | undefined> | null

export type ChartPoint = [number, ChartPointValue]

export interface SummaryResponse {
  totalDataChart: ChartPoint[]
  hasLabelBreakdown?: boolean
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

let queued: Promise<void> = Promise.resolve()
let lastRun = 0
function scheduleRequest<T>(task: () => Promise<T>): Promise<T> {
  const run = queued
    .catch(() => undefined)
    .then(async () => {
      const now = Date.now()
      const wait = Math.max(0, lastRun + REQUEST_INTERVAL_MS - now)
      if (wait > 0) {
        await sleep(wait)
      }
      lastRun = Date.now()
      return task()
    })

  queued = run.then(
    () => undefined,
    () => undefined
  )

  return run
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    const snippet = text.length > 300 ? `${text.slice(0, 300)}...` : text
    throw new Error(`DefiLlama request failed ${res.status} ${res.statusText}: ${snippet}`)
  }
  return (await res.json()) as T
}

export async function fetchFeesOverview(): Promise<OverviewResponse> {
  return scheduleRequest(() => fetchJson<OverviewResponse>(`${API_BASE}/overview/fees`))
}

export async function fetchProtocolSummary(slug: string, metric: MetricApiType): Promise<SummaryResponse> {
  const query = metric ? `?dataType=${metric}` : ''
  return scheduleRequest(() => fetchJson<SummaryResponse>(`${API_BASE}/summary/fees/${slug}${query}`))
}
