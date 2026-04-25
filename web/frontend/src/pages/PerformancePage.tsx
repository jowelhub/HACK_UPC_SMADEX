import { useEffect, useMemo, useRef, useState } from 'react'
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

const ASIDE_W_KEY = 'perfAsideW'
/** Fixed list viewport; overflow-y when many rows (desktop + mobile). */
const CAMPAIGN_LIST_SCROLL =
  'flex h-[10.25rem] min-h-0 flex-col overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]'
const CREATIVE_LIST_SCROLL =
  'flex h-[12.25rem] min-h-0 flex-col overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]'
const ROW_MIN = 'min-h-[2rem]'
/** Desktop: fills panel and scrolls. Mobile: natural height; whole aside scrolls. */
const ADVERTISER_LIST_BODY =
  'flex flex-col overscroll-contain [-webkit-overflow-scrolling:touch] max-lg:flex-none max-lg:overflow-visible lg:min-h-0 lg:flex-1 lg:overflow-y-auto'
/** Space for fixed mobile tab bar + safe area */
const MOBILE_TAB_PAD = 'pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]'

type MobilePerfTab = 'selection' | 'results'

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

const METRIC_OPTIONS = [
  { key: 'ctr', label: 'CTR' },
  { key: 'cvr', label: 'CVR' },
  { key: 'viewability_rate', label: 'Viewability' },
  { key: 'spend_usd', label: 'Spend (USD)' },
  { key: 'impressions', label: 'Impressions' },
  { key: 'viewable_impressions', label: 'Viewable imps' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'conversions', label: 'Conversions' },
  { key: 'revenue_usd', label: 'Revenue (USD)' },
  { key: 'video_completions', label: 'Video completions' },
  { key: 'cpa_usd', label: 'CPA (USD)' },
  { key: 'ipm', label: 'IPM' },
  { key: 'roas', label: 'ROAS' },
] as const

type MetricKey = (typeof METRIC_OPTIONS)[number]['key']

function metricLabel(key: MetricKey): string {
  return METRIC_OPTIONS.find((m) => m.key === key)?.label ?? key
}

function isPct01Metric(key: MetricKey): boolean {
  return key === 'ctr' || key === 'cvr' || key === 'viewability_rate'
}

function isUsdMetric(key: MetricKey): boolean {
  return key === 'spend_usd' || key === 'revenue_usd' || key === 'cpa_usd'
}

function formatMetricValue(key: MetricKey, v: number): string {
  if (Number.isNaN(v)) return '-'
  if (isPct01Metric(key)) return fmtPct(v)
  if (isUsdMetric(key)) return `$${fmt(v, v >= 100 ? 0 : 2)}`
  if (key === 'roas' || key === 'ipm') return fmt(v, 3)
  return fmt(v, 0)
}

function formatMetricTick(key: MetricKey, v: number): string {
  if (Number.isNaN(v)) return ''
  if (isPct01Metric(key)) return `${(v * 100).toFixed(1)}%`
  if (isUsdMetric(key) && Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (isUsdMetric(key) && Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k`
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 10000) return `${(v / 1000).toFixed(0)}k`
  if (key === 'roas' || key === 'ipm') return fmt(v, 2)
  return fmt(v, 0)
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

function pickListRow(active: boolean) {
  return `${ROW_MIN} w-full border-b border-stone-100 px-2 py-1 text-left text-[13px] leading-snug transition-colors last:border-b-0 ${
    active
      ? 'border-l-2 border-l-brand bg-brand-50 font-medium text-brand-900'
      : 'border-l-2 border-l-transparent text-stone-800 hover:bg-stone-50'
  }`
}

function dashedSlots(count: number) {
  return Array.from({ length: count }, (_, i) => (
    <div key={`empty-${i}`} className={`${ROW_MIN} shrink-0 border-b border-dotted border-stone-100`} aria-hidden />
  ))
}

function readInitialAsideW(): number {
  if (typeof window === 'undefined') return 280
  const raw = localStorage.getItem(ASIDE_W_KEY)
  const n = raw ? Number(raw) : NaN
  return Number.isFinite(n) && n >= 200 && n <= 560 ? n : 280
}

export function PerformancePage() {
  const [hierarchy, setHierarchy] = useState<HierarchyAdvertiser[] | null>(null)
  const [opts, setOpts] = useState<Record<string, unknown> | null>(null)
  const [scope, setScope] = useState<PerformanceScope>({ kind: 'all' })
  const [dates, setDates] = useState<{ from: string; to: string }>({ from: '', to: '' })
  const [err, setErr] = useState<string | null>(null)
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPerformanceQuery>> | null>(null)
  const [creativeAssetOk, setCreativeAssetOk] = useState(true)
  const [asideW, setAsideW] = useState(readInitialAsideW)
  const [isLg, setIsLg] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false,
  )
  const [mobileTab, setMobileTab] = useState<MobilePerfTab>('selection')
  const [tsLeft, setTsLeft] = useState<MetricKey>('ctr')
  const [tsRight, setTsRight] = useState<MetricKey>('spend_usd')
  const [barMetric, setBarMetric] = useState<MetricKey>('spend_usd')
  const asideWRef = useRef(asideW)
  const dragRef = useRef<{ pageX: number; startW: number } | null>(null)
  const mainScrollRef = useRef<HTMLElement>(null)

  asideWRef.current = asideW

  useEffect(() => {
    if (isLg || mobileTab !== 'results') return
    mainScrollRef.current?.scrollTo(0, 0)
  }, [isLg, mobileTab])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(min-width: 1024px)')
    const fn = () => {
      setIsLg(mq.matches)
      if (mq.matches) setMobileTab('selection')
    }
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

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
    const rows = [...breakdownRaw] as Array<Record<string, unknown> & { label?: string }>
    const k = barMetric
    rows.sort((a, b) => Number(b[k] ?? 0) - Number(a[k] ?? 0))
    return rows.slice(0, 12).map((r) => ({
      name: String(r.label ?? r.campaign_id ?? r.creative_id ?? '?').slice(0, 42),
      v: Number(r[k] ?? 0),
    }))
  }, [breakdownRaw, barMetric])

  const otherMetric = (exclude: MetricKey): MetricKey => {
    return METRIC_OPTIONS.find((m) => m.key !== exclude)?.key ?? 'spend_usd'
  }

  const chartTooltip = {
    contentStyle: {
      background: '#ffffff',
      border: '1px solid #e7e5e4',
      borderRadius: '4px',
      boxShadow: 'none',
    },
    labelStyle: { color: '#44403c', fontWeight: 600 },
    itemStyle: { color: '#57534e' },
  }

  const advSelectedId = scope.kind === 'all' ? null : scope.advertiserId
  const campSelectedId =
    scope.kind === 'campaign' || scope.kind === 'creative' ? scope.campaignId : null
  const creSelectedId = scope.kind === 'creative' ? scope.creativeId : null

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { pageX: e.pageX, startW: asideWRef.current }
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      const maxW = Math.min(560, Math.floor(window.innerWidth * 0.45))
      const w = Math.min(maxW, Math.max(200, d.startW + (ev.pageX - d.pageX)))
      asideWRef.current = w
      setAsideW(w)
    }
    const onUp = () => {
      dragRef.current = null
      try {
        localStorage.setItem(ASIDE_W_KEY, String(asideWRef.current))
      } catch {
        /* ignore */
      }
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const campaignRows = selectedAdvertiser?.campaigns ?? []
  const creativePad = selectedCampaign ? Math.max(0, 6 - creatives.length) : 0

  const hasBreakdownChart = barData.length > 0
  const hasCreativePreview = scope.kind === 'creative'
  const showMetricsTopRight = hasCreativePreview || hasBreakdownChart

  const showSelection = isLg || mobileTab === 'selection'
  const showResults = isLg || mobileTab === 'results'

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-canvas">
      <div
        className={`flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:h-full lg:min-h-0 lg:flex-row lg:items-stretch lg:overflow-hidden ${MOBILE_TAB_PAD} lg:pb-0`}
      >
        <aside
          className={`flex min-h-0 flex-col gap-2 border-stone-200 bg-canvas px-2 py-3 max-lg:overflow-y-auto max-lg:overscroll-y-contain sm:px-3 lg:h-full lg:min-h-0 lg:max-w-[min(45vw,560px)] lg:shrink-0 lg:overflow-hidden lg:border-r lg:bg-white lg:py-4 ${
            showSelection ? 'flex-1 lg:flex-none' : 'hidden'
          }`}
          style={{ width: isLg ? asideW : undefined }}
          aria-hidden={!showSelection}
        >
          <div className="shrink-0 lg:hidden">
            <h1 className="font-display text-lg font-semibold tracking-tight text-stone-900">Performance</h1>
          </div>

          <div className="flex min-w-0 flex-col rounded-sm border border-stone-200 bg-white max-lg:shrink-0 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
            <div className="shrink-0 space-y-2 border-b border-stone-200 p-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-medium uppercase text-stone-500">From</span>
                  <input
                    type="date"
                    className="input w-full text-xs"
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
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-medium uppercase text-stone-500">To</span>
                  <input
                    type="date"
                    className="input w-full text-xs"
                    min={
                      dates.from && dateRange?.min
                        ? clampIsoDate(dates.from, dateRange.min, dateRange.max)
                        : dateRange?.min
                    }
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
            </div>

            <div className="flex min-w-0 shrink-0 flex-col border-b border-stone-200 lg:flex-[1_0_0%] lg:min-h-[10rem] lg:overflow-hidden">
              <div className="shrink-0 border-b border-stone-100 bg-stone-50 px-2 py-1 text-[10px] font-medium uppercase text-stone-600">
                Advertiser
              </div>
              <div className={ADVERTISER_LIST_BODY}>
                <button type="button" className={pickListRow(scope.kind === 'all')} onClick={() => setScope({ kind: 'all' })}>
                  All
                </button>
                {hierarchy?.map((a) => (
                  <button
                    key={a.advertiser_id}
                    type="button"
                    className={pickListRow(advSelectedId === a.advertiser_id)}
                    onClick={() => setScope({ kind: 'advertiser', advertiserId: a.advertiser_id })}
                  >
                    {a.label}
                  </button>
                ))}
                {!hierarchy?.length && !err ? <p className="px-2 py-2 text-xs text-stone-500">Loading…</p> : null}
              </div>
            </div>

            <div className={`flex shrink-0 flex-col ${!selectedAdvertiser ? 'opacity-50' : ''}`}>
              <div className="shrink-0 border-b border-stone-100 bg-stone-50 px-2 py-1 text-[10px] font-medium uppercase text-stone-600">
                Campaign
              </div>
              <div className={CAMPAIGN_LIST_SCROLL}>
                {!selectedAdvertiser ? (
                  dashedSlots(5)
                ) : campaignRows.length === 0 ? (
                  dashedSlots(5)
                ) : (
                  campaignRows.map((c) => (
                    <button
                      key={c.campaign_id}
                      type="button"
                      className={pickListRow(campSelectedId === c.campaign_id)}
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
            </div>

            <div className={`flex shrink-0 flex-col ${!selectedCampaign ? 'opacity-50' : ''}`}>
              <div className="shrink-0 border-b border-stone-100 bg-stone-50 px-2 py-1 text-[10px] font-medium uppercase text-stone-600">
                Creative
              </div>
              <div className={CREATIVE_LIST_SCROLL}>
                {!selectedCampaign ? (
                  dashedSlots(6)
                ) : (
                  <>
                    {creatives.map((cr) => (
                      <button
                        key={cr.creative_id}
                        type="button"
                        className={pickListRow(creSelectedId === cr.creative_id)}
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
                    ))}
                    {dashedSlots(creativePad)}
                  </>
                )}
              </div>
            </div>
          </div>
        </aside>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize scope panel"
          onMouseDown={startResize}
          className="hidden w-1.5 shrink-0 cursor-col-resize select-none self-stretch bg-stone-200/70 hover:bg-brand/30 active:bg-brand/40 lg:block lg:min-h-0"
        />

        <main
          ref={mainScrollRef}
          className={`min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 lg:block lg:h-full lg:min-h-0 lg:max-h-full lg:overflow-y-auto lg:overflow-x-hidden ${
            showResults ? 'block' : 'hidden'
          }`}
          aria-hidden={!showResults}
        >
          <div className="mb-3 lg:hidden">
            <h2 className="text-lg font-semibold text-stone-900">Results</h2>
          </div>
          <div className="mb-4 hidden lg:block">
            <h1 className="text-xl font-semibold text-stone-900">Performance</h1>
          </div>

        {err ? <p className="mb-4 text-sm text-red-600">{err}</p> : null}

        {summary ? (
          <>
            <div
              className={`mb-5 flex flex-col gap-4 ${showMetricsTopRight ? 'lg:flex-row lg:items-stretch lg:gap-6' : ''}`}
            >
              <div
                className={`grid min-w-0 grid-cols-2 gap-3 ${showMetricsTopRight ? 'lg:min-w-0 lg:flex-1' : ''}`}
              >
                <MetricCard label="Spend (USD)" value={fmt(summary.total_spend_usd, 0)} />
                <MetricCard label="Impressions" value={fmt(summary.total_impressions, 0)} />
                <MetricCard label="Clicks" value={fmt(summary.total_clicks as number, 0)} />
                <MetricCard label="Conversions" value={fmt(summary.total_conversions as number, 0)} />
                <MetricCard label="Revenue (USD)" value={fmt(summary.total_revenue_usd as number)} />
                <MetricCard label="Viewability" value={fmtPct(summary.overall_viewability_rate as number)} />
                <MetricCard label="CTR" value={fmtPct(summary.overall_ctr as number)} />
                <MetricCard label="CPA (USD)" value={fmt(summary.overall_cpa_usd as number)} />
                <MetricCard label="CVR" value={fmtPct(summary.overall_cvr as number)} />
                <MetricCard label="IPM" value={fmt(summary.overall_ipm as number)} />
                <MetricCard label="ROAS" value={fmt(summary.overall_roas as number)} />
                <MetricCard label="Rows" value={fmt(data?.row_count, 0)} />
              </div>

              {showMetricsTopRight ? (
                <div className="flex min-h-0 w-full shrink-0 flex-col gap-4 sm:mx-auto sm:max-w-md lg:mx-0 lg:w-[min(38%,380px)] lg:max-w-[380px]">
                  {hasBreakdownChart ? (
                    <div className="surface-panel flex min-h-0 flex-col">
                      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <h3 className="text-sm font-semibold text-stone-900">
                          {scope.kind === 'advertiser' ? 'By campaign' : 'By creative'}
                        </h3>
                        <label className="flex items-center gap-1 text-xs text-stone-600">
                          <span className="text-stone-500">Metric</span>
                          <select
                            className="input py-1 text-xs"
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
                      <div className="mt-1 h-72 w-full shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={barData}
                            layout="vertical"
                            margin={{ left: 2, right: 10, top: 4, bottom: 4 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" horizontal={false} />
                            <XAxis
                              type="number"
                              tick={{ fill: '#78716c', fontSize: 10 }}
                              tickFormatter={(v) => formatMetricTick(barMetric, Number(v))}
                            />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={100}
                              tick={{ fill: '#57534e', fontSize: 9 }}
                              interval={0}
                            />
                            <Tooltip
                              {...chartTooltip}
                              formatter={(v) => [formatMetricValue(barMetric, Number(v)), metricLabel(barMetric)]}
                            />
                            <Bar dataKey="v" name={metricLabel(barMetric)} fill="#7c3aad" radius={[0, 2, 2, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ) : null}

                  {hasCreativePreview ? (
                    <div className="flex shrink-0 justify-center border border-stone-200 bg-white p-3">
                      <div className="flex min-h-[10rem] w-full max-w-[280px] items-center justify-center lg:min-h-[14rem]">
                        {creativeAssetOk ? (
                          <img
                            src={creativeAssetUrl(scope.creativeId)}
                            alt="Creative"
                            className="max-h-64 w-full object-contain sm:max-h-80 lg:max-h-[min(56vh,520px)]"
                            onError={() => setCreativeAssetOk(false)}
                          />
                        ) : (
                          <span className="text-xs text-stone-500">No image</span>
                        )}
                      </div>
                    </div>
                  ) : null}
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
                        setTsRight((r) => (r === v ? otherMetric(v) : r))
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
                        setTsLeft((l) => (l === v ? otherMetric(v) : l))
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
              <div className="mt-1 h-64 sm:h-72">
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
                      {...chartTooltip}
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
        </main>
      </div>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 flex justify-center gap-2 border-t border-stone-200 bg-white/95 px-3 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur-md supports-[padding:max(0px)]:pb-[max(10px,env(safe-area-inset-bottom))] lg:hidden"
        aria-label="Performance view"
      >
        <button
          type="button"
          onClick={() => setMobileTab('selection')}
          className={`min-h-10 min-w-[44%] max-w-[11rem] rounded border px-3 text-sm font-medium transition ${
            mobileTab === 'selection' ? 'border-brand bg-brand text-white' : 'border-stone-200 bg-white text-stone-700'
          }`}
        >
          Selection
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('results')}
          className={`min-h-10 min-w-[44%] max-w-[11rem] rounded border px-3 text-sm font-medium transition ${
            mobileTab === 'results' ? 'border-brand bg-brand text-white' : 'border-stone-200 bg-white text-stone-700'
          }`}
        >
          Results
        </button>
      </nav>
    </div>
  )
}
