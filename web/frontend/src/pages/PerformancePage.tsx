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
import {
  creativeAssetUrl,
  fetchFilterOptions,
  fetchPerformanceHierarchy,
  fetchPerformanceQuery,
  type HierarchyAdvertiser,
  type HierarchyCampaign,
  type HierarchyCreative,
  type PerformanceFilters,
  type PerformanceScope,
} from '../lib/api'

function clampIsoDate(ymd: string, min?: string, max?: string): string {
  let v = ymd
  if (min && v < min) v = min
  if (max && v > max) v = max
  return v
}

function fmt(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-'
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

function fmtPct(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-'
  return `${(n * 100).toFixed(2)}%`
}

function filtersForScope(scope: PerformanceScope, dates: { from: string; to: string }): PerformanceFilters {
  const base: PerformanceFilters = { date_from: dates.from, date_to: dates.to }
  if (scope.kind === 'all') return base
  if (scope.kind === 'advertiser') return { ...base, advertiser_ids: [scope.advertiserId] }
  if (scope.kind === 'campaign')
    return { ...base, advertiser_ids: [scope.advertiserId], campaign_ids: [scope.campaignId] }
  return {
    ...base,
    advertiser_ids: [scope.advertiserId],
    campaign_ids: [scope.campaignId],
    creative_ids: [scope.creativeId],
  }
}

function breakdownForScope(scope: PerformanceScope): string | null {
  if (scope.kind === 'advertiser') return 'campaign_id'
  if (scope.kind === 'campaign') return 'creative_id'
  return null
}

function pickListBtn(active: boolean) {
  return `w-full rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition ${
    active
      ? 'border-brand bg-brand text-white shadow-sm ring-2 ring-brand/20'
      : 'border-stone-200 bg-white text-stone-800 hover:border-brand/35 hover:bg-stone-50'
  }`
}

export function PerformancePage() {
  const [hierarchy, setHierarchy] = useState<HierarchyAdvertiser[] | null>(null)
  const [opts, setOpts] = useState<Record<string, unknown> | null>(null)
  const [scope, setScope] = useState<PerformanceScope>({ kind: 'all' })
  const [dates, setDates] = useState<{ from: string; to: string }>({ from: '', to: '' })
  const [err, setErr] = useState<string | null>(null)
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPerformanceQuery>> | null>(null)
  const [creativeAssetOk, setCreativeAssetOk] = useState(true)

  useEffect(() => {
    void fetchPerformanceHierarchy()
      .then((h) => setHierarchy(h.advertisers))
      .catch((e) => setErr(String(e)))
  }, [])

  const dateRange = opts?.date_range as { min?: string; max?: string } | undefined

  useEffect(() => {
    void fetchFilterOptions({})
      .then((o) => setOpts(o.options))
      .catch((e) => setErr(String(e)))
  }, [])

  useEffect(() => {
    if (!dateRange?.min || !dateRange?.max) return
    setDates((d) => {
      if (d.from && d.to) return d
      return { from: dateRange.min!, to: dateRange.max! }
    })
  }, [dateRange?.min, dateRange?.max])

  const filters = useMemo(() => {
    if (!dates.from || !dates.to) return null
    return filtersForScope(scope, dates)
  }, [scope, dates])

  useEffect(() => {
    if (!filters) return
    let cancelled = false
    setErr(null)
    const bd = breakdownForScope(scope)
    void fetchPerformanceQuery({
      filters,
      timeseries_grain: 'day',
      breakdown: bd,
      leaderboard: null,
      include_entity_rankings: false,
    })
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [filters])

  useEffect(() => {
    setCreativeAssetOk(true)
  }, [scope])

  const selectedAdvertiser: HierarchyAdvertiser | null = useMemo(() => {
    if (scope.kind === 'all') return null
    return hierarchy?.find((a) => a.advertiser_id === scope.advertiserId) ?? null
  }, [hierarchy, scope])

  const selectedCampaign: HierarchyCampaign | null = useMemo(() => {
    if (scope.kind === 'all' || scope.kind === 'advertiser') return null
    return selectedAdvertiser?.campaigns.find((c) => c.campaign_id === scope.campaignId) ?? null
  }, [selectedAdvertiser, scope])

  const creatives: HierarchyCreative[] = selectedCampaign?.creatives ?? []

  const summary = data?.summary
  const ts = data?.timeseries ?? []
  const breakdownRaw = data?.breakdown ?? []

  const barData = useMemo(() => {
    const rows = [...breakdownRaw] as Array<Record<string, unknown> & { label?: string; spend_usd?: number }>
    rows.sort((a, b) => Number(b.spend_usd ?? 0) - Number(a.spend_usd ?? 0))
    return rows.slice(0, 12).map((r) => ({
      name: String(r.label ?? r.campaign_id ?? r.creative_id ?? '?').slice(0, 42),
      spend: Number(r.spend_usd ?? 0),
      ctr: r.ctr != null ? Number(r.ctr) * 100 : null,
    }))
  }, [breakdownRaw])

  const chartTooltip = {
    contentStyle: {
      background: '#ffffff',
      border: '1px solid #e7e5e4',
      borderRadius: '12px',
      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.07)',
    },
    labelStyle: { color: '#44403c', fontWeight: 600 },
    itemStyle: { color: '#57534e' },
  }

  const advSelectedId = scope.kind === 'all' ? null : scope.advertiserId
  const campSelectedId =
    scope.kind === 'campaign' || scope.kind === 'creative' ? scope.campaignId : null
  const creSelectedId = scope.kind === 'creative' ? scope.creativeId : null

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto bg-canvas">
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold tracking-tight text-brand">Performance</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Choose <strong className="font-medium text-stone-800">All</strong> or one advertiser, then a campaign and
            creative. Metrics update for the current selection and date range.
          </p>
        </div>

        <section className="mb-6 grid gap-3 md:grid-cols-3" aria-label="Scope selection">
          <div className="surface-panel flex min-h-[14rem] flex-col gap-2 !py-3 md:max-h-[min(52vh,28rem)] md:overflow-y-auto">
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Advertiser</h2>
            <button type="button" className={pickListBtn(scope.kind === 'all')} onClick={() => setScope({ kind: 'all' })}>
              All
            </button>
            {hierarchy?.map((a) => (
              <button
                key={a.advertiser_id}
                type="button"
                className={pickListBtn(advSelectedId === a.advertiser_id)}
                onClick={() => setScope({ kind: 'advertiser', advertiserId: a.advertiser_id })}
              >
                {a.label}
              </button>
            ))}
            {!hierarchy?.length && !err ? (
              <p className="text-xs text-stone-500">Loading advertisers…</p>
            ) : null}
          </div>

          <div
            className={`surface-panel flex min-h-[14rem] flex-col gap-2 !py-3 md:max-h-[min(52vh,28rem)] md:overflow-y-auto ${
              !selectedAdvertiser ? 'opacity-60' : ''
            }`}
          >
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Campaign</h2>
            {!selectedAdvertiser ? (
              <p className="text-sm text-stone-500">Select an advertiser to list campaigns.</p>
            ) : (
              selectedAdvertiser.campaigns.map((c) => (
                <button
                  key={c.campaign_id}
                  type="button"
                  disabled={!selectedAdvertiser}
                  className={pickListBtn(campSelectedId === c.campaign_id)}
                  onClick={() =>
                    setScope({
                      kind: 'campaign',
                      advertiserId: selectedAdvertiser.advertiser_id,
                      campaignId: c.campaign_id,
                    })
                  }
                >
                  {c.label}
                </button>
              ))
            )}
          </div>

          <div
            className={`surface-panel flex min-h-[14rem] flex-col gap-2 !py-3 md:max-h-[min(52vh,28rem)] md:overflow-y-auto ${
              !selectedCampaign ? 'opacity-60' : ''
            }`}
          >
            <h2 className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Creative</h2>
            {!selectedCampaign ? (
              <p className="text-sm text-stone-500">Select a campaign to list creatives.</p>
            ) : (
              creatives.map((cr) => (
                <button
                  key={cr.creative_id}
                  type="button"
                  className={pickListBtn(creSelectedId === cr.creative_id)}
                  onClick={() => {
                    if (!selectedAdvertiser) return
                    setScope({
                      kind: 'creative',
                      advertiserId: selectedAdvertiser.advertiser_id,
                      campaignId: selectedCampaign.campaign_id,
                      creativeId: cr.creative_id,
                    })
                  }}
                >
                  {cr.label}
                </button>
              ))
            )}
          </div>
        </section>

        <section className="surface-panel mb-6 !py-3">
          <div className="flex min-w-0 flex-wrap items-end gap-3">
            <label className="flex min-w-[9rem] flex-1 flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">From</span>
              <input
                type="date"
                className="input w-full py-1.5 text-sm"
                min={dateRange?.min}
                max={dates.to && dateRange?.max ? clampIsoDate(dates.to, dateRange.min, dateRange.max) : dateRange?.max}
                value={dates.from}
                onChange={(e) => {
                  const raw = e.target.value
                  if (!dateRange?.min || !dateRange?.max) return
                  const from = raw ? clampIsoDate(raw, dateRange.min, dateRange.max) : dateRange.min
                  let to = dates.to || dateRange.max
                  to = clampIsoDate(to, dateRange.min, dateRange.max)
                  if (from > to) setDates({ from, to: from })
                  else setDates({ from, to })
                }}
              />
            </label>
            <label className="flex min-w-[9rem] flex-1 flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">To</span>
              <input
                type="date"
                className="input w-full py-1.5 text-sm"
                min={dates.from && dateRange?.min ? clampIsoDate(dates.from, dateRange.min, dateRange.max) : dateRange?.min}
                max={dateRange?.max}
                value={dates.to}
                onChange={(e) => {
                  const raw = e.target.value
                  if (!dateRange?.min || !dateRange?.max) return
                  const to = raw ? clampIsoDate(raw, dateRange.min, dateRange.max) : dateRange.max
                  let from = dates.from || dateRange.min
                  from = clampIsoDate(from, dateRange.min, dateRange.max)
                  if (to < from) setDates({ from: to, to })
                  else setDates({ from, to })
                }}
              />
            </label>
          </div>
        </section>

        {err ? <p className="mb-4 text-sm text-red-600">{err}</p> : null}

        {summary ? (
          <>
            <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Spend (USD)" value={fmt(summary.total_spend_usd, 0)} />
              <MetricCard label="Impressions" value={fmt(summary.total_impressions, 0)} />
              <MetricCard label="Clicks" value={fmt(summary.total_clicks as number, 0)} />
              <MetricCard label="Conversions" value={fmt(summary.total_conversions as number, 0)} />
              <MetricCard label="Revenue (USD)" value={fmt(summary.total_revenue_usd as number, 0)} />
              <MetricCard
                label="Viewability"
                value={fmtPct(summary.overall_viewability_rate as number)}
                hint="Viewable imps / imps"
              />
              <MetricCard label="CTR" value={fmtPct(summary.overall_ctr as number)} hint="Clicks / impressions" />
              <MetricCard label="CPA (USD)" value={fmt(summary.overall_cpa_usd as number)} hint="Spend / conversions" />
              <MetricCard label="CVR" value={fmtPct(summary.overall_cvr as number)} />
              <MetricCard label="IPM" value={fmt(summary.overall_ipm as number)} hint="Conv per 1k imps" />
              <MetricCard label="ROAS" value={fmt(summary.overall_roas as number)} />
              <MetricCard
                label="Rows / entities"
                value={`${fmt(data?.row_count, 0)} rows`}
                hint={`${summary.distinct_creatives} creatives | ${summary.distinct_campaigns} campaigns | ${Number(summary.distinct_advertisers ?? 0)} advertisers | ${summary.calendar_days_in_window} days`}
              />
            </div>

            {scope.kind === 'creative' ? (
              <div className="surface-panel mb-5 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                <div className="flex min-h-[10rem] min-w-[8rem] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-stone-200 bg-stone-50 shadow-sm">
                  {creativeAssetOk ? (
                    <img
                      src={creativeAssetUrl(scope.creativeId)}
                      alt="Creative asset"
                      className="max-h-56 w-auto max-w-full object-contain"
                      onError={() => setCreativeAssetOk(false)}
                    />
                  ) : (
                    <span className="px-4 text-center text-xs text-stone-500">No image file on server for this creative.</span>
                  )}
                </div>
                <p className="text-center text-xs text-stone-600 sm:text-left">
                  Preview loads from the import bundle when the PNG exists on the API host (
                  <code className="rounded bg-stone-100 px-1">IMPORT_DATA_DIR</code>).
                </p>
              </div>
            ) : null}

            <div className="surface-panel mb-5">
              <h3 className="font-display text-sm font-semibold text-brand">CTR & spend over time</h3>
              <p className="mt-0.5 text-xs text-stone-600">Daily totals for the current scope.</p>
              <div className="mt-3 h-64 sm:h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={ts}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                    <XAxis dataKey="date" tick={{ fill: '#78716c', fontSize: 11 }} />
                    <YAxis
                      yAxisId="l"
                      tick={{ fill: '#78716c', fontSize: 11 }}
                      tickFormatter={(v) => `${(Number(v) * 100).toFixed(2)}%`}
                    />
                    <YAxis yAxisId="r" orientation="right" tick={{ fill: '#78716c', fontSize: 11 }} />
                    <Tooltip
                      {...chartTooltip}
                      formatter={(value, name) => {
                        const label = String(name)
                        if (value === undefined || value === null) return ['-', label]
                        const num = typeof value === 'number' ? value : Number(value)
                        if (Number.isNaN(num)) return ['-', label]
                        if (label === 'CTR') return [fmtPct(num), label]
                        return [fmt(num, 0), label]
                      }}
                    />
                    <Legend />
                    <Line yAxisId="l" type="monotone" dataKey="ctr" name="CTR" stroke="#7c3aad" dot={false} strokeWidth={2} />
                    <Line
                      yAxisId="r"
                      type="monotone"
                      dataKey="spend_usd"
                      name="Spend (USD)"
                      stroke="#5e2d87"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {barData.length > 0 ? (
              <div className="surface-panel">
                <h3 className="font-display text-sm font-semibold text-brand">
                  {scope.kind === 'advertiser' ? 'Spend by campaign' : 'Spend by creative'}
                </h3>
                <p className="mt-0.5 text-xs text-stone-600">Top slices in this scope (by spend).</p>
                <div className="mt-3 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" horizontal={false} />
                      <XAxis type="number" tick={{ fill: '#78716c', fontSize: 11 }} tickFormatter={(v) => fmt(v, 0)} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={118}
                        tick={{ fill: '#57534e', fontSize: 10 }}
                        interval={0}
                      />
                      <Tooltip {...chartTooltip} formatter={(v) => [fmt(Number(v), 0), 'Spend (USD)']} />
                      <Bar dataKey="spend" name="Spend (USD)" fill="#7c3aad" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-stone-500">Loading metrics…</p>
        )}
      </div>
    </div>
  )
}
