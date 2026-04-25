import { useEffect, useMemo, useState } from 'react'
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
import { MetricCard } from '../components/MetricCard'
import type { LabeledOption } from '../components/MultiSelect'
import { MultiSelect } from '../components/MultiSelect'
import { fetchFilterOptions, fetchPerformanceQuery, type PerformanceFilters } from '../lib/api'

function fmt(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-'
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

function fmtPct(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-'
  return `${(n * 100).toFixed(2)}%`
}

function optionsForChip(
  o: Record<string, unknown> | null,
  optKey: string,
  labeledKey?: string,
): (string | number)[] | LabeledOption[] {
  if (!o) return []
  if (labeledKey) {
    const labeled = o[labeledKey] as LabeledOption[] | undefined
    if (labeled && Array.isArray(labeled) && labeled.length > 0) return labeled
  }
  const raw = o[optKey]
  return Array.isArray(raw) ? (raw as (string | number)[]) : []
}

export function PerformancePage() {
  const [opts, setOpts] = useState<Record<string, unknown> | null>(null)
  const [filters, setFilters] = useState<PerformanceFilters>({})
  const [breakdown, setBreakdown] = useState<string>('')
  const [lbMetric, setLbMetric] = useState('ctr')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPerformanceQuery>> | null>(null)

  useEffect(() => {
    void fetchFilterOptions(filters)
      .then((o) => setOpts(o.options))
      .catch((e) => setErr(String(e)))
  }, [filters])

  const dateRange = opts?.date_range as { min?: string; max?: string } | undefined

  const setPreset = (preset: 'all' | '30' | '7') => {
    if (!dateRange?.min || !dateRange?.max) return
    if (preset === 'all') {
      setFilters((f) => ({ ...f, date_from: undefined, date_to: undefined }))
      return
    }
    const end = new Date(dateRange.max)
    const days = preset === '30' ? 30 : 7
    const start = new Date(end)
    start.setDate(start.getDate() - (days - 1))
    const minD = new Date(dateRange.min)
    if (start < minD) start.setTime(minD.getTime())
    setFilters((f) => ({
      ...f,
      date_from: start.toISOString().slice(0, 10),
      date_to: end.toISOString().slice(0, 10),
    }))
  }

  const run = async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetchPerformanceQuery({
        filters,
        timeseries_grain: 'day',
        breakdown: breakdown || null,
        leaderboard: { by: 'creative_id', metric: lbMetric, limit: 12 },
      })
      setData(res)
    } catch (e) {
      setErr(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchPerformanceQuery({
      filters: {},
      timeseries_grain: 'day',
      breakdown: null,
      leaderboard: { by: 'creative_id', metric: 'ctr', limit: 12 },
    })
      .then(setData)
      .catch((e) => setErr(String(e)))
  }, [])

  const summary = data?.summary

  const ts = useMemo(() => data?.timeseries ?? [], [data])
  const br = useMemo(() => data?.breakdown ?? [], [data])
  const lb = useMemo(() => data?.leaderboard ?? [], [data])

  const chipKeys: { key: keyof PerformanceFilters; label: string; optKey: string; labeledKey?: string }[] = [
    { key: 'advertiser_ids', label: 'Advertisers', optKey: 'advertiser_id', labeledKey: 'advertiser_labeled' },
    { key: 'campaign_ids', label: 'Campaigns', optKey: 'campaign_id', labeledKey: 'campaign_labeled' },
    { key: 'creative_ids', label: 'Creatives', optKey: 'creative_id', labeledKey: 'creative_labeled' },
    { key: 'countries', label: 'Countries', optKey: 'country' },
    { key: 'os_list', label: 'OS', optKey: 'os' },
    { key: 'verticals', label: 'Vertical', optKey: 'vertical' },
    { key: 'objectives', label: 'Objective', optKey: 'objective' },
    { key: 'formats', label: 'Format', optKey: 'format' },
    { key: 'themes', label: 'Theme', optKey: 'theme' },
    { key: 'hook_types', label: 'Hook', optKey: 'hook_type' },
    { key: 'languages', label: 'Language', optKey: 'language' },
    { key: 'primary_themes', label: 'Primary theme', optKey: 'primary_theme' },
    { key: 'target_os_list', label: 'Target OS', optKey: 'target_os' },
    { key: 'target_age_segments', label: 'Age segment', optKey: 'target_age_segment' },
    { key: 'hq_regions', label: 'HQ region', optKey: 'advertiser_hq_region' },
    { key: 'dominant_colors', label: 'Color', optKey: 'dominant_color' },
    { key: 'emotional_tones', label: 'Tone', optKey: 'emotional_tone' },
  ]
  const numericRanges = (opts?.numeric_ranges as Record<string, { min: number | null; max: number | null }> | undefined) || {}
  const numericKeys = [
    ['days_since_launch', 'Days live'],
    ['daily_budget_usd', 'Daily budget'],
    ['duration_sec', 'Duration'],
    ['text_density', 'Text density'],
    ['copy_length_chars', 'Copy length'],
    ['readability_score', 'Readability'],
    ['brand_visibility_score', 'Brand visibility'],
    ['clutter_score', 'Clutter'],
    ['novelty_score', 'Novelty'],
    ['motion_score', 'Motion'],
    ['faces_count', 'Faces'],
    ['product_count', 'Products'],
  ] as const

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Performance explorer</h1>
        <p className="mt-1 text-sm text-slate-400">
          All metrics are aggregated from <code className="text-accent">creative_daily_country_os_stats</code> after joins - no
          pre-baked creative_summary totals unless you choose the same window.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Time</span>
          <button type="button" onClick={() => setPreset('all')} className="btn-secondary !py-1 text-xs">
            All time
          </button>
          <button type="button" onClick={() => setPreset('30')} className="btn-secondary !py-1 text-xs">
            Last 30 days
          </button>
          <button type="button" onClick={() => setPreset('7')} className="btn-secondary !py-1 text-xs">
            Last 7 days
          </button>
          <div className="ml-auto flex flex-wrap gap-2">
            <input
              type="date"
              className="input"
              value={(filters.date_from as string) || ''}
              onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value || undefined }))}
            />
            <input
              type="date"
              className="input"
              value={(filters.date_to as string) || ''}
              onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value || undefined }))}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {chipKeys.slice(0, 6).map(({ key, label, optKey, labeledKey }) => (
            <MultiSelect
              key={String(key)}
              label={label}
              options={optionsForChip(opts, optKey, labeledKey)}
              value={(filters[key] as (string | number)[]) || []}
              onChange={(v) => setFilters((f) => ({ ...f, [key]: v.length ? v : undefined }))}
            />
          ))}
        </div>
        <details className="mt-4 rounded-lg border border-slate-800 bg-ink-950/50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-300">More filters</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {chipKeys.slice(6).map(({ key, label, optKey, labeledKey }) => (
              <MultiSelect
                key={String(key)}
                label={label}
                options={optionsForChip(opts, optKey, labeledKey)}
                value={(filters[key] as (string | number)[]) || []}
                onChange={(v) => setFilters((f) => ({ ...f, [key]: v.length ? v : undefined }))}
              />
            ))}
          </div>
          <div className="mt-4 border-t border-slate-800 pt-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Numeric ranges</div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {numericKeys.map(([key, label]) => {
                const range = numericRanges[key]
                return (
                  <div key={key}>
                    <div className="mb-1 text-xs text-slate-500">
                      {label}
                      {range ? (
                        <span className="ml-1 text-slate-600">
                          ({fmt(range.min ?? undefined)}-{fmt(range.max ?? undefined)})
                        </span>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <input
                        className="input w-full"
                        placeholder="min"
                        value={(filters[`${key}_min`] as string | number | undefined) ?? ''}
                        onChange={(e) =>
                          setFilters((f) => ({ ...f, [`${key}_min`]: e.target.value === '' ? undefined : Number(e.target.value) }))
                        }
                      />
                      <input
                        className="input w-full"
                        placeholder="max"
                        value={(filters[`${key}_max`] as string | number | undefined) ?? ''}
                        onChange={(e) =>
                          setFilters((f) => ({ ...f, [`${key}_max`]: e.target.value === '' ? undefined : Number(e.target.value) }))
                        }
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </details>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 text-xs font-medium uppercase text-slate-500">Breakdown</div>
            <select className="input" value={breakdown} onChange={(e) => setBreakdown(e.target.value)}>
              <option value="">None</option>
              <option value="country">Country</option>
              <option value="os">OS</option>
              <option value="format">Format</option>
              <option value="vertical">Vertical</option>
            </select>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium uppercase text-slate-500">Leaderboard sort</div>
            <select className="input" value={lbMetric} onChange={(e) => setLbMetric(e.target.value)}>
              <option value="ctr">CTR</option>
              <option value="cpa">CPA</option>
              <option value="roas">ROAS</option>
              <option value="ipm">IPM</option>
            </select>
          </div>
          <button type="button" className="btn-primary" disabled={loading} onClick={() => run()}>
            {loading ? 'Loading…' : 'Apply filters'}
          </button>
        </div>
        {err ? <p className="mt-3 text-sm text-red-400">{err}</p> : null}
      </section>

      {summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Spend (USD)" value={fmt(summary.total_spend_usd, 0)} />
            <MetricCard label="Impressions" value={fmt(summary.total_impressions, 0)} />
            <MetricCard label="CTR" value={fmtPct(summary.overall_ctr as number)} hint="Clicks / impressions" />
            <MetricCard label="CPA (USD)" value={fmt(summary.overall_cpa_usd as number)} hint="Spend / conversions" />
            <MetricCard label="CVR" value={fmtPct(summary.overall_cvr as number)} />
            <MetricCard label="IPM" value={fmt(summary.overall_ipm as number)} hint="Conv per 1k imps" />
            <MetricCard label="ROAS" value={fmt(summary.overall_roas as number)} />
            <MetricCard
              label="Rows / entities"
              value={`${fmt(data?.row_count, 0)} rows`}
              hint={`${summary.distinct_creatives} creatives | ${summary.distinct_campaigns} campaigns | ${summary.calendar_days_in_window} days`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
              <h3 className="font-display text-sm font-semibold text-white">CTR & spend over time</h3>
              <div className="mt-3 h-64 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ts}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis yAxisId="l" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid #334155' }} />
                    <Legend />
                    <Line yAxisId="l" type="monotone" dataKey="ctr" name="CTR" stroke="#22d3ee" dot={false} strokeWidth={2} />
                    <Line yAxisId="r" type="monotone" dataKey="spend_usd" name="Spend" stroke="#a78bfa" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {breakdown ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
                <h3 className="font-display text-sm font-semibold text-white">Breakdown | {breakdown}</h3>
                <div className="mt-3 h-64 sm:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={br}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey={breakdown} tick={{ fill: '#94a3b8', fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={60} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: '#111827', border: '1px solid #334155' }} />
                      <Bar dataKey="ctr" fill="#22d3ee" name="CTR" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/20 p-6 text-sm text-slate-500">
                Select a breakdown dimension to compare CTR across segments.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
            <h3 className="font-display text-sm font-semibold text-white">Creative leaderboard</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500">
                    <th className="py-2 pr-2">Creative</th>
                    <th className="py-2">Impressions</th>
                    <th className="py-2">CTR</th>
                    <th className="py-2">CPA</th>
                    <th className="py-2">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {lb.map((row) => (
                    <tr key={String(row.creative_id)} className="border-b border-slate-800/60 text-slate-300">
                      <td className="py-2">
                        <div className="max-w-[220px] truncate text-sm text-slate-200" title={String(row.creative_label || '')}>
                          {String(row.creative_label || row.creative_id)}
                        </div>
                        <div className="font-mono text-[10px] text-slate-500">#{String(row.creative_id)}</div>
                      </td>
                      <td className="py-2">{fmt(row.impressions as number, 0)}</td>
                      <td className="py-2">{fmtPct(row.ctr as number)}</td>
                      <td className="py-2">{fmt(row.cpa_usd as number)}</td>
                      <td className="py-2">{fmt(row.roas as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
