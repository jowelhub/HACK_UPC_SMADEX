import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ResponsiveChartWrapper } from './ResponsiveChartWrapper'
import type { PerformanceQueryResponse } from '../lib/api'
import { CREATIVE_CROSS_DIM } from '../lib/performanceLabels'
import {
  chartTooltipStyle,
  formatMetricTick,
  formatMetricValue,
  metricLabel,
  METRIC_OPTIONS,
  type MetricKey,
} from '../lib/performanceFormat'
import { explorerUi } from '../lib/explorerUi'

const DIM_ORDER = ['country', 'os', 'format'] as const
const DIM_TITLES: Record<(typeof DIM_ORDER)[number], string> = {
  country: 'By country',
  os: 'By OS',
  format: 'By format',
}

type Props = {
  data: PerformanceQueryResponse | null
  queryError: string | null
  fixedMetric?: MetricKey
}

export function CreativeCrossDimensionSection({ data, queryError, fixedMetric }: Props) {
  const [barMetric, setBarMetric] = useState<MetricKey>('ctr')
  const selectedMetric = fixedMetric ?? barMetric

  const breakdowns = data?.breakdowns

  const panels = useMemo(() => {
    if (!breakdowns) return []
    return DIM_ORDER.map((dim) => {
      const raw = breakdowns[dim] as Array<Record<string, unknown>> | undefined
      if (!raw?.length) return { dim, title: DIM_TITLES[dim], barData: [] as { name: string; v: number }[] }
      const rows = [...raw] as Array<Record<string, unknown> & { label?: string }>
      const k = selectedMetric
      rows.sort((a, b) => Number(b[k] ?? 0) - Number(a[k] ?? 0))
      const barData = rows.slice(0, 16).map((r) => ({
        name: String(r.label ?? r[dim] ?? '?').slice(0, 36),
        v: Number(r[k] ?? 0),
      }))
      return { dim, title: DIM_TITLES[dim], barData }
    })
  }, [breakdowns, selectedMetric])

  if (queryError) return null
  if (!data?.summary) return null

  const hasAny = panels.some((p) => p.barData.length > 0)
  if (!hasAny) return null

  return (
    <div className="mt-8">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h2 className={explorerUi.sectionTitle}>{CREATIVE_CROSS_DIM.heading}</h2>
        </div>
        {!fixedMetric ? (
          <label className="flex min-w-0 items-center gap-1 text-xs text-stone-600">
            <span className="shrink-0 text-stone-500">Chart metric</span>
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
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {panels.map(({ dim, title, barData }) => (
          <div key={dim} className="surface-panel flex min-h-0 min-w-0 flex-col">
            <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
            {barData.length === 0 ? (
              <p className="mt-2 text-xs text-stone-500">No rows for this dimension in the selected window.</p>
            ) : (
              <div className="mt-2 h-[min(16rem,38dvh)] min-h-[11rem] w-full min-w-0 flex-1">
                <ResponsiveChartWrapper>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} layout="vertical" margin={{ left: 2, right: 8, top: 4, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fill: '#78716c', fontSize: 10 }}
                        tickFormatter={(v) => formatMetricTick(selectedMetric, Number(v))}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={dim === 'country' ? 36 : 52}
                        tick={{ fill: '#57534e', fontSize: 9 }}
                        interval={0}
                      />
                      <Tooltip
                        {...chartTooltipStyle}
                        formatter={(v: unknown) => [formatMetricValue(selectedMetric, Number(v)), metricLabel(selectedMetric)]}
                      />
                      <Bar dataKey="v" name={metricLabel(selectedMetric)} fill="#0d9488" radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ResponsiveChartWrapper>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
