'use client'

import { ProtocolBadge } from '@/components/valuation/protocol-badge'
import { WINDOWS, WINDOW_LABELS, computeAnnualizedValuation, formatUSD, formatYi, metricLabel, type ActiveMetricType, type MetricDetail } from '@/lib/valuation'

export function MetricSummaryCard({ metric, detail, pe }: { metric: ActiveMetricType; detail?: MetricDetail; pe: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ProtocolBadge label={metricLabel[metric]} metric={detail?.available ? metric : null} />
          <span className="text-[11px] text-[#9cb2d1]">{detail?.latest ? `${detail.latest}` : '暂无数据'}</span>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {WINDOWS.map((window) => {
          const total = detail?.totals?.[window] ?? null
          const valuation = computeAnnualizedValuation(total, window, pe)
          return (
            <div key={window} className="flex justify-between rounded-lg border border-white/10 bg-[#0f1b2c]/70 p-3">
              <div>
                <div className="text-[11px] uppercase text-[#7c8ba7]">{WINDOW_LABELS[window]}</div>
                <div className="text-sm font-semibold text-[#f6fbff]">{(total || 0) > 1e8 ? formatYi(total) : formatUSD(total)}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#7c8ba7]">估值</div>
                <div className="text-sm font-semibold text-[#6df2c8]">{formatYi(valuation)}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
