import type { NextRequest } from 'next/server'
import type { NormalizedMetricType } from './ingest'

const parsedCacheSeconds = Number(process.env.API_CACHE_SECONDS)
export const API_CACHE_TTL_SECONDS = Number.isFinite(parsedCacheSeconds) && parsedCacheSeconds > 0 ? parsedCacheSeconds : 43200
export const API_CACHE_CONTROL_HEADER = `public, max-age=${API_CACHE_TTL_SECONDS}, s-maxage=${API_CACHE_TTL_SECONDS}, stale-while-revalidate=${API_CACHE_TTL_SECONDS}`

const ALLOWED_METRICS: NormalizedMetricType[] = ['fees', 'revenue', 'holders_revenue']

export function authorizeRequest(request: NextRequest, options: { envKey?: string } = {}): boolean {
  const envKey = options.envKey ?? 'INGEST_SECRET'
  const secret = envKey ? process.env[envKey] : null
  if (!secret) return true

  const headerToken = request.headers.get('x-ingest-secret')
  const queryToken = request.nextUrl.searchParams.get('token')
  return headerToken === secret || queryToken === secret
}

export function parseMetricTypes(param: string | null): NormalizedMetricType[] | undefined {
  if (!param) return undefined

  const parsed = param
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .map((value) => (value === 'holdersrevenue' || value === 'holders_revenue' ? 'holders_revenue' : value === 'revenue' ? 'revenue' : value === 'fees' ? 'fees' : null))
    .filter((value): value is NormalizedMetricType => Boolean(value))

  const unique = Array.from(new Set(parsed))
  return unique.length ? unique.filter((metric) => ALLOWED_METRICS.includes(metric)) : undefined
}

export function parseStringList(param: string | null, options: { allowEmpty?: boolean } = {}): string[] | undefined {
  if (!param) return options.allowEmpty ? [] : undefined
  const values = param
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)

  if (!values.length) return options.allowEmpty ? [] : undefined
  return Array.from(new Set(values))
}
