import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { MetricCard } from './MetricCard'
import type { PerformanceQueryResponse } from '../lib/api'
import {
  chartTooltipStyle,
  fmt,
  fmtPct,
  formatMetricTick,
  formatMetricValue,
  metricLabel,
  METRIC_OPTIONS,
  otherMetricKey,
  type MetricKey,
} from '../lib/performanceFormat'

type Props = {
  data: PerformanceQueryResponse | null
  err: string | null
  /** When set, shows vertical bar chart (by campaign or by creative). */
  breakdownTitle: string | null
  /** Tighter metric grid when a side chart is shown (advertiser / campaign scope). */
  compactMetrics?: boolean
}

export function PerformanceResultPanels({ data, err, breakdownTitle, compactMetrics }: Props) {
  const [barMetric, setBarMetric] = useState<MetricKey>('spend_usd')
  const [tsLeft, setTsLeft] = useState<MetricKey>('ctr')
  const [tsRight, setTsRight] = useState<MetricKey>('spend_usd')

  const summary = data?.summary
  const ts = data?.timeseries ?? []
  const breakdownRaw = data?.breakdown ?? []

  const barData = useMemo(() => {
    const rows = [...breakdownRaw] as Array<Record<string, unknown> & { label?: string }>
    const k = barMetric
    rows.sort((a, b) => Number(b[k] ?? 0) - Number(a[k] ?? 0))
    return rows.slice(0, 12).map((r) => ({
      name: String(r.label ?? r.campaign_id ?? r.creative_id ?? '?').slice(0, 42),
      v: Number(r[k] ?? 0),
    }))
  }, [breakdownRaw, barMetric])

  const hasBreakdownChart = Boolean(breakdownTitle) && barData.length > 0
  const showMetricsTopRight = hasBreakdownChart
  const compact = Boolean(compactMetrics && showMetricsTopRight)

  return (
    <div>
      {err ? <p className="mb-4 text-sm text-red-600">{err}</p> : null}

      {summary ? (
        <>
          <div
            className={`mb-5 flex flex-col gap-4 ${showMetricsTopRight ? 'lg:flex-row lg:items-stretch lg:gap-4 xl:gap-6' : ''}`}
          >
            <div
              className={`grid min-w-0 grid-cols-2 gap-2 sm:gap-2.5 ${
                showMetricsTopRight ? 'w-full shrink-0 lg:max-w-[min(24rem,36vw)] xl:max-w-[min(26rem,32vw)]' : ''
              }`}
            >
              <MetricCard compact={compact} label="Spend (USD)" value={fmt(summary.total_spend_usd, 0)} />
              <MetricCard compact={compact} label="Impressions" value={fmt(summary.total_impressions, 0)} />
              <MetricCard compact={compact} label="Clicks" value={fmt(summary.total_clicks as number, 0)} />
              <MetricCard compact={compact} label="Conversions" value={fmt(summary.total_conversions as number, 0)} />
              <MetricCard compact={compact} label="Revenue (USD)" value={fmt(summary.total_revenue_usd as number)} />
              <MetricCard compact={compact} label="Viewability" value={fmtPct(summary.overall_viewability_rate as number)} />
              <MetricCard compact={compact} label="CTR" value={fmtPct(summary.overall_ctr as number)} />
              <MetricCard compact={compact} label="CPA (USD)" value={fmt(summary.overall_cpa_usd as number)} />
              <MetricCard compact={compact} label="CVR" value={fmtPct(summary.overall_cvr as number)} />
              <MetricCard compact={compact} label="IPM" value={fmt(summary.overall_ipm as number)} />
              <MetricCard compact={compact} label="ROAS" value={fmt(summary.overall_roas as number)} />
              <MetricCard compact={compact} label="Rows" value={fmt(data?.row_count, 0)} />
            </div>

            {hasBreakdownChart ? (
              <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 max-lg:mx-auto max-lg:max-w-lg lg:mx-0">
                <div className="surface-panel flex min-h-0 min-w-0 flex-1 flex-col">
                  <div className="mb-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
                    <h3 className="text-sm font-semibold text-stone-900">{breakdownTitle}</h3>
                    <label className="flex min-w-0 items-center gap-1 text-xs text-stone-600">
                      <span className="shrink-0 text-stone-500">Metric</span>
                      <select
                        className="input max-w-full py-1 text-xs"
                        value={barMetric}
                        onChange={(e) => setBarMetric(e.target.value as MetricKey)}
                      >
                        {METRIC_OPTIONS.map((m) => (
                          <option key={m.key} value={m.key}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-1 min-h-[12rem] w-full min-w-0 flex-1 sm:min-h-[14rem]">
                    <div className="h-[min(18rem,45dvh)] w-full sm:h-[min(20rem,42dvh)] lg:h-[min(22rem,48dvh)] xl:h-[min(26rem,52vh)]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={barData} layout="vertical" margin={{ left: 2, right: 8, top: 4, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" horizontal={false} />
                          <XAxis
                            type="number"
                            tick={{ fill: '#78716c', fontSize: 10 }}
                            tickFormatter={(v) => formatMetricTick(barMetric, Number(v))}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={108}
                            tick={{ fill: '#57534e', fontSize: 9 }}
                            interval={0}
                          />
                          <Tooltip
                            {...chartTooltipStyle}
                            formatter={(v) => [formatMetricValue(barMetric, Number(v)), metricLabel(barMetric)]}
                          />
                          <Bar dataKey="v" name={metricLabel(barMetric)} fill="#7c3aad" radius={[0, 2, 2, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="surface-panel mb-5">
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <h3 className="text-sm font-semibold text-stone-900">Daily series</h3>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-1 text-xs text-stone-600">
                  <span className="text-stone-500">Y1</span>
                  <select
                    className="input py-1 text-xs"
                    value={tsLeft}
                    onChange={(e) => {
                      const v = e.target.value as MetricKey
                      setTsLeft(v)
                      setTsRight((r) => (r === v ? otherMetricKey(v) : r))
                    }}
                  >
                    {METRIC_OPTIONS.map((m) => (
                      <option key={m.key} value={m.key} disabled={m.key === tsRight}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1 text-xs text-stone-600">
                  <span className="text-stone-500">Y2</span>
                  <select
                    className="input py-1 text-xs"
                    value={tsRight}
                    onChange={(e) => {
                      const v = e.target.value as MetricKey
                      setTsRight(v)
                      setTsLeft((l) => (l === v ? otherMetricKey(v) : l))
                    }}
                  >
                    {METRIC_OPTIONS.map((m) => (
                      <option key={m.key} value={m.key} disabled={m.key === tsLeft}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="mt-1 h-[min(16rem,42dvh)] sm:h-[min(18rem,40dvh)] lg:h-72 xl:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ts}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                  <XAxis dataKey="date" tick={{ fill: '#78716c', fontSize: 11 }} />
                  <YAxis
                    yAxisId="l"
                    tick={{ fill: '#78716c', fontSize: 11 }}
                    tickFormatter={(v) => formatMetricTick(tsLeft, Number(v))}
                  />
                  <YAxis
                    yAxisId="r"
                    orientation="right"
                    tick={{ fill: '#78716c', fontSize: 11 }}
                    tickFormatter={(v) => formatMetricTick(tsRight, Number(v))}
                  />
                  <Tooltip
                    {...chartTooltipStyle}
                    formatter={(value, name) => {
                      const label = String(name)
                      if (value === undefined || value === null) return ['-', label]
                      const num = typeof value === 'number' ? value : Number(value)
                      if (Number.isNaN(num)) return ['-', label]
                      const ll = metricLabel(tsLeft)
                      const rr = metricLabel(tsRight)
                      if (label === ll) return [formatMetricValue(tsLeft, num), ll]
                      if (label === rr) return [formatMetricValue(tsRight, num), rr]
                      return [formatMetricValue(tsLeft, num), label]
                    }}
                  />
                  <Legend />
                  <Line
                    yAxisId="l"
                    type="monotone"
                    dataKey={tsLeft}
                    name={metricLabel(tsLeft)}
                    stroke="#7c3aad"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="r"
                    type="monotone"
                    dataKey={tsRight}
                    name={metricLabel(tsRight)}
                    stroke="#5e2d87"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : (
        <p className="text-sm text-stone-500">Loading metrics…</p>
      )}
    </div>
  )
}
