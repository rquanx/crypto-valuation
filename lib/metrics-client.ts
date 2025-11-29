'use client'

import type { ApiSeriesResponse } from './valuation'

export function metricsQueryKey(slug: string, refreshNonce = 0) {
  return ['protocolMetrics', slug.toLowerCase(), refreshNonce] as const
}

export async function fetchMetrics(slug: string): Promise<ApiSeriesResponse> {
  const res = await fetch(`/api/metrics/${encodeURIComponent(slug)}`)
  const json = await res.json()
  if (!json.ok) throw new Error(json.error || `加载 ${slug} 数据失败`)
  return json as ApiSeriesResponse
}
