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
/** Five campaign rows (~2rem each). */
const CAMPAIGN_LIST_H = 'h-[10.25rem]'
/** Six creative rows. */
const CREATIVE_LIST_H = 'h-[12.25rem]'
const ROW_MIN = 'min-h-[2rem]'
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

  const showSelection = isLg || mobileTab === 'selection'
  const showResults = isLg || mobileTab === 'results'

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-canvas">
      <div
        className={`flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:h-full lg:min-h-0 lg:flex-row lg:items-stretch lg:overflow-hidden ${MOBILE_TAB_PAD} lg:pb-0`}
      >
        <aside
          className={`flex min-h-0 flex-col gap-2 overflow-hidden border-stone-200 bg-canvas px-2 py-3 sm:px-3 lg:h-full lg:min-h-0 lg:max-w-[min(45vw,560px)] lg:shrink-0 lg:border-r lg:bg-white lg:py-4 ${
            showSelection ? 'flex-1 lg:flex-none' : 'hidden'
          }`}
          style={{ width: isLg ? asideW : undefined }}
          aria-hidden={!showSelection}
        >
          <div className="shrink-0 lg:hidden">
            <h1 className="font-display text-lg font-semibold tracking-tight text-stone-900">Performance</h1>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-sm border border-stone-200 bg-white">
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

            <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-stone-200">
              <div className="shrink-0 border-b border-stone-100 bg-stone-50 px-2 py-1 text-[10px] font-medium uppercase text-stone-600">
                Advertiser
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
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
              <div className={`flex flex-col overflow-y-auto overscroll-contain ${CAMPAIGN_LIST_H}`}>
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
              <div className={`flex flex-col overflow-y-auto overscroll-contain ${CREATIVE_LIST_H}`}>
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
            <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Spend (USD)" value={fmt(summary.total_spend_usd, 0)} />
              <MetricCard label="Impressions" value={fmt(summary.total_impressions, 0)} />
              <MetricCard label="Clicks" value={fmt(summary.total_clicks as number, 0)} />
              <MetricCard label="Conversions" value={fmt(summary.total_conversions as number, 0)} />
              <MetricCard label="Revenue (USD)" value={fmt(summary.total_revenue_usd as number, 0)} />
              <MetricCard label="Viewability" value={fmtPct(summary.overall_viewability_rate as number)} />
              <MetricCard label="CTR" value={fmtPct(summary.overall_ctr as number)} />
              <MetricCard label="CPA (USD)" value={fmt(summary.overall_cpa_usd as number)} />
              <MetricCard label="CVR" value={fmtPct(summary.overall_cvr as number)} />
              <MetricCard label="IPM" value={fmt(summary.overall_ipm as number)} />
              <MetricCard label="ROAS" value={fmt(summary.overall_roas as number)} />
              <MetricCard label="Rows" value={fmt(data?.row_count, 0)} />
            </div>

            {scope.kind === 'creative' ? (
              <div className="mb-5 flex justify-center border border-stone-200 bg-white p-3">
                <div className="flex min-h-[8rem] max-w-full items-center justify-center">
                  {creativeAssetOk ? (
                    <img
                      src={creativeAssetUrl(scope.creativeId)}
                      alt="Creative"
                      className="max-h-52 w-auto object-contain"
                      onError={() => setCreativeAssetOk(false)}
                    />
                  ) : (
                    <span className="text-xs text-stone-500">No image</span>
                  )}
                </div>
              </div>
            ) : null}

            <div className="surface-panel mb-5">
              <h3 className="text-sm font-semibold text-stone-900">CTR & spend</h3>
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
                <h3 className="text-sm font-semibold text-stone-900">
                  {scope.kind === 'advertiser' ? 'Spend by campaign' : 'Spend by creative'}
                </h3>
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
                      <Bar dataKey="spend" name="Spend (USD)" fill="#7c3aad" radius={[0, 2, 2, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}
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
