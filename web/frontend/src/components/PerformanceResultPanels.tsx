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
  timeseriesMetricFromKpiGoal,
  type MetricKey,
} from '../lib/performanceFormat'
import { DAILY_SERIES_SECTION, PERFORMANCE_SECTION } from '../lib/performanceLabels'
import { explorerUi } from '../lib/explorerUi'

type PerfSummary = NonNullable<PerformanceQueryResponse['summary']>

function metricSummaryCards(compact: boolean, summary: PerfSummary) {
  return (
    <>
      <MetricCard compact={compact} label="Spend (USD)" value={fmt(summary.total_spend_usd, 0)} />
      <MetricCard compact={compact} label="Revenue (USD)" value={fmt(summary.total_revenue_usd as number)} />
      <MetricCard compact={compact} label="Impressions" value={fmt(summary.total_impressions, 0)} />
      <MetricCard compact={compact} label="Clicks" value={fmt(summary.total_clicks as number, 0)} />
      <MetricCard compact={compact} label="Conversions" value={fmt(summary.total_conversions as number, 0)} />
      <MetricCard compact={compact} label="CTR" value={fmtPct(summary.overall_ctr as number)} />
      <MetricCard compact={compact} label="CPA (USD)" value={fmt(summary.overall_cpa_usd as number)} />
      <MetricCard compact={compact} label="ROAS" value={fmt(summary.overall_roas as number)} />
    </>
  )
}

type Props = {
  data: PerformanceQueryResponse | null
  err: string | null
  /** When set, shows vertical bar chart below the KPI + daily row (by campaign or by creative). */
  breakdownTitle: string | null
  /** Tighter KPI grid when daily series sits beside it (lg+). */
  compactMetrics?: boolean
  /** Campaign page: daily series follows `kpi_goal` (no Y1/Y2 selectors). */
  lockDailySeriesToKpiGoal?: boolean
  /** Raw `kpi_goal` from hierarchy (e.g. CPA, ROAS); used when `lockDailySeriesToKpiGoal`. */
  kpiGoal?: string | null
}

export function PerformanceResultPanels({
  data,
  err,
  breakdownTitle,
  compactMetrics,
  lockDailySeriesToKpiGoal,
  kpiGoal,
}: Props) {
  const [barMetric, setBarMetric] = useState<MetricKey>('spend_usd')
  const [tsLeft, setTsLeft] = useState<MetricKey>('ctr')
  const [tsRight, setTsRight] = useState<MetricKey>('spend_usd')

  const kpiTimeseriesMetric = useMemo(
    () => timeseriesMetricFromKpiGoal(lockDailySeriesToKpiGoal ? kpiGoal : undefined),
    [lockDailySeriesToKpiGoal, kpiGoal],
  )

  const summary = data?.summary
  const ts = data?.timeseries ?? []
  /** Chronological rows with `day_index` 1…n for X-axis (calendar date stays in payload for tooltips). */
  const tsChartData = useMemo(() => {
    const rows = [...ts] as Array<Record<string, unknown> & { date?: string }>
    rows.sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
    return rows.map((row, i) => ({ ...row, day_index: i + 1 }))
  }, [ts])
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
  const hasTimeseries = ts.length > 0
  /** KPIs left, daily line chart right (lg+). */
  const topRowSplit = hasTimeseries
  const compact = Boolean(compactMetrics && topRowSplit)

  const kpiGoalLabel = (kpiGoal && String(kpiGoal).trim()) || 'CPA'
  const kpiLineName = metricLabel(kpiTimeseriesMetric)
  const spendLineName = metricLabel('spend_usd')

  const dailySeriesPanel = lockDailySeriesToKpiGoal ? (
    <div className="surface-panel flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <div className="mb-2 min-w-0">
        <p className="text-xs text-stone-600">
          KPI goal: <span className="font-medium text-stone-800">{kpiGoalLabel}</span>
        </p>
      </div>
      <div className="mt-1 h-[min(16rem,42dvh)] min-h-[12rem] w-full min-w-0 flex-1 sm:h-[min(18rem,40dvh)] lg:h-[min(20rem,44dvh)] xl:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={tsChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis
              dataKey="day_index"
              tick={{ fill: '#78716c', fontSize: 11 }}
              allowDecimals={false}
              minTickGap={10}
            />
            <YAxis
              yAxisId="kpi"
              tick={{ fill: '#6b21a8', fontSize: 11 }}
              tickFormatter={(v) => formatMetricTick(kpiTimeseriesMetric, Number(v))}
            />
            <YAxis
              yAxisId="spend"
              orientation="right"
              tick={{ fill: '#0f766e', fontSize: 11 }}
              tickFormatter={(v) => formatMetricTick('spend_usd', Number(v))}
            />
            <Tooltip
              {...chartTooltipStyle}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as { date?: string; day_index?: number } | undefined
                const d = row?.date != null ? String(row.date) : null
                const day = row?.day_index
                if (d && day != null) return `Day ${day} · ${d}`
                if (day != null) return `Day ${day}`
                return ''
              }}
              formatter={(value, name) => {
                if (value === undefined || value === null) return ['-', String(name)]
                const num = typeof value === 'number' ? value : Number(value)
                if (Number.isNaN(num)) return ['-', String(name)]
                const label = String(name)
                if (label === spendLineName) return [formatMetricValue('spend_usd', num), spendLineName]
                return [formatMetricValue(kpiTimeseriesMetric, num), kpiLineName]
              }}
            />
            <Legend />
            <Line
              yAxisId="kpi"
              type="monotone"
              dataKey={kpiTimeseriesMetric}
              name={kpiLineName}
              stroke="#7c3aad"
              dot={false}
              strokeWidth={2}
            />
            <Line
              yAxisId="spend"
              type="monotone"
              dataKey="spend_usd"
              name={spendLineName}
              stroke="#0d9488"
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  ) : (
    <div className="surface-panel flex min-h-0 min-w-0 w-full flex-1 flex-col">
      <div className="mb-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
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
      <div className="mt-1 h-[min(16rem,42dvh)] min-h-[12rem] w-full min-w-0 flex-1 sm:h-[min(18rem,40dvh)] lg:h-[min(20rem,44dvh)] xl:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={tsChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis
              dataKey="day_index"
              tick={{ fill: '#78716c', fontSize: 11 }}
              allowDecimals={false}
              minTickGap={10}
            />
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
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as { date?: string; day_index?: number } | undefined
                const d = row?.date != null ? String(row.date) : null
                const day = row?.day_index
                if (d && day != null) return `Day ${day} · ${d}`
                if (day != null) return `Day ${day}`
                return ''
              }}
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
  )

  return (
    <div>
      {err ? <p className="mb-4 text-sm text-red-600">{err}</p> : null}

      {summary ? (
        <>
          {topRowSplit ? (
            <div className="mb-5 grid max-lg:grid-cols-1 max-lg:gap-4 lg:grid-cols-[minmax(0,min(24rem,36vw))_minmax(0,1fr)] lg:items-start lg:gap-x-4 lg:gap-y-3 lg:content-start xl:gap-x-6">
              <h2 className={`${explorerUi.performanceLabel} max-lg:order-1 lg:col-start-1 lg:row-start-1`}>
                {PERFORMANCE_SECTION.heading}
              </h2>
              <h2 className={`${explorerUi.performanceLabel} max-lg:order-3 lg:col-start-2 lg:row-start-1`}>
                {DAILY_SERIES_SECTION.heading}
              </h2>
              <div
                className={`grid min-w-0 grid-cols-2 gap-2 sm:gap-2.5 max-lg:order-2 lg:col-start-1 lg:row-start-2 lg:w-full lg:max-w-[min(24rem,36vw)] xl:max-w-[min(26rem,32vw)]`}
              >
                {metricSummaryCards(compact, summary)}
              </div>
              <div className="flex min-h-0 min-w-0 w-full flex-col max-lg:order-4 lg:col-start-2 lg:row-start-2 lg:mx-0">
                {dailySeriesPanel}
              </div>
            </div>
          ) : (
            <>
              <h2 className={explorerUi.performanceLabel}>{PERFORMANCE_SECTION.heading}</h2>
              <div className="mb-5">
                <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-2.5">{metricSummaryCards(compact, summary)}</div>
              </div>
            </>
          )}

          {hasBreakdownChart ? (
            <div className="surface-panel mb-5">
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
              <div className="mt-1 min-h-[12rem] w-full min-w-0 sm:min-h-[14rem]">
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
          ) : null}
        </>
      ) : (
        <p className="text-sm text-stone-500">Loading metrics…</p>
      )}
    </div>
  )
}
