import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { MetricCard } from '../components/MetricCard'
import type { LabeledOption } from '../components/MultiSelect'
import { MultiSelect } from '../components/MultiSelect'
import { fetchFilterOptions, fetchPerformanceQuery, type PerformanceFilters } from '../lib/api'

function idListSignature(v: unknown): string {
  if (!Array.isArray(v) || v.length === 0) return ''
  return [...v].map(String).sort().join(',')
}

/** Clamp YYYY-MM-DD to dataset bounds (inclusive). */
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
  const [err, setErr] = useState<string | null>(null)
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPerformanceQuery>> | null>(null)

  useEffect(() => {
    void fetchFilterOptions(filters)
      .then((o) => setOpts(o.options))
      .catch((e) => setErr(String(e)))
  }, [filters])

  const dateRange = opts?.date_range as { min?: string; max?: string } | undefined

  useEffect(() => {
    if (!dateRange?.min || !dateRange?.max) return
    setFilters((f) => {
      if (f.date_from && f.date_to) return f
      return { ...f, date_from: dateRange.min, date_to: dateRange.max }
    })
  }, [dateRange?.min, dateRange?.max])

  useEffect(() => {
    if (!opts) return
    const validCampaigns = new Set((opts.campaign_id as (string | number)[] | undefined)?.map(String) ?? [])
    const validCreatives = new Set((opts.creative_id as (string | number)[] | undefined)?.map(String) ?? [])
    setFilters((f) => {
      const campRaw = f.campaign_ids as (string | number)[] | undefined
      const creRaw = f.creative_ids as (string | number)[] | undefined
      const nextCamp =
        Array.isArray(campRaw) && campRaw.length ? campRaw.filter((id) => validCampaigns.has(String(id))) : undefined
      const nextCre = Array.isArray(creRaw) && creRaw.length ? creRaw.filter((id) => validCreatives.has(String(id))) : undefined
      const campFinal = nextCamp?.length ? nextCamp : undefined
      const creFinal = nextCre?.length ? nextCre : undefined
      if (idListSignature(f.campaign_ids) === idListSignature(campFinal) && idListSignature(f.creative_ids) === idListSignature(creFinal)) {
        return f
      }
      return { ...f, campaign_ids: campFinal, creative_ids: creFinal }
    })
  }, [opts])

  useEffect(() => {
    let cancelled = false
    setErr(null)
    void fetchPerformanceQuery({
      filters,
      timeseries_grain: 'day',
      breakdown: null,
      leaderboard: null,
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

  const summary = data?.summary

  const ts = useMemo(() => data?.timeseries ?? [], [data])

  const handleDateFromInput = (raw: string) => {
    const bmin = dateRange?.min
    const bmax = dateRange?.max
    if (!bmin || !bmax) return
    setFilters((f) => {
      let from = raw ? clampIsoDate(raw, bmin, bmax) : bmin
      let to = (f.date_to as string | undefined) || bmax
      to = clampIsoDate(to, bmin, bmax)
      if (from > to) to = from
      return { ...f, date_from: from, date_to: to }
    })
  }

  const handleDateToInput = (raw: string) => {
    const bmin = dateRange?.min
    const bmax = dateRange?.max
    if (!bmin || !bmax) return
    setFilters((f) => {
      let to = raw ? clampIsoDate(raw, bmin, bmax) : bmax
      let from = (f.date_from as string | undefined) || bmin
      from = clampIsoDate(from, bmin, bmax)
      if (to < from) from = to
      return { ...f, date_from: from, date_to: to }
    })
  }

  const dateFromMax =
    dateRange?.max &&
    (filters.date_to as string | undefined) &&
    String(filters.date_to) <= dateRange.max
      ? String(filters.date_to)
      : dateRange?.max
  const dateToMin =
    dateRange?.min &&
    (filters.date_from as string | undefined) &&
    String(filters.date_from) >= dateRange.min
      ? String(filters.date_from)
      : dateRange?.min

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
  const entityChipKeys = chipKeys.slice(0, 3)
  const moreChipKeys = chipKeys.slice(3)
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
          Metrics from <code className="text-accent">creative_daily_country_os_stats</code> with joins; filters slice the same fact rows.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 sm:p-5">
        <div className="mb-4 flex min-w-0 flex-wrap items-end gap-3">
          <label className="flex min-w-0 max-w-xs flex-1 flex-col gap-1 basis-[10rem]">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">From</span>
            <input
              type="date"
              className="input w-full min-w-0 py-1.5 text-sm"
              min={dateRange?.min}
              max={dateFromMax}
              value={(filters.date_from as string) || ''}
              onChange={(e) => handleDateFromInput(e.target.value)}
            />
          </label>
          <label className="flex min-w-0 max-w-xs flex-1 flex-col gap-1 basis-[10rem]">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">To</span>
            <input
              type="date"
              className="input w-full min-w-0 py-1.5 text-sm"
              min={dateToMin}
              max={dateRange?.max}
              value={(filters.date_to as string) || ''}
              onChange={(e) => handleDateToInput(e.target.value)}
            />
          </label>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">
          <div className="min-w-0 rounded-lg border border-slate-800/70 bg-slate-950/25 p-3">
              <MultiSelect
                label={entityChipKeys[0].label}
                options={optionsForChip(opts, entityChipKeys[0].optKey, entityChipKeys[0].labeledKey)}
                value={(filters[entityChipKeys[0].key] as (string | number)[]) || []}
                onChange={(v) => setFilters((f) => ({ ...f, [entityChipKeys[0].key]: v.length ? v : undefined }))}
                searchable
                searchPlaceholder="Search advertisers…"
                maxChipRows={3}
              />
          </div>
          <div className="min-w-0 rounded-lg border border-slate-800/70 bg-slate-950/25 p-3">
              <MultiSelect
                label={entityChipKeys[1].label}
                options={optionsForChip(opts, entityChipKeys[1].optKey, entityChipKeys[1].labeledKey)}
                value={(filters[entityChipKeys[1].key] as (string | number)[]) || []}
                onChange={(v) => setFilters((f) => ({ ...f, [entityChipKeys[1].key]: v.length ? v : undefined }))}
                searchable
                searchPlaceholder="Search campaigns…"
                maxChipRows={3}
              />
          </div>
          <div className="min-w-0 rounded-lg border border-slate-800/70 bg-slate-950/25 p-3">
              <MultiSelect
                label={entityChipKeys[2].label}
                options={optionsForChip(opts, entityChipKeys[2].optKey, entityChipKeys[2].labeledKey)}
                value={(filters[entityChipKeys[2].key] as (string | number)[]) || []}
                onChange={(v) => setFilters((f) => ({ ...f, [entityChipKeys[2].key]: v.length ? v : undefined }))}
                searchable
                searchPlaceholder="Search creatives…"
                maxChipRows={3}
              />
          </div>
        </div>
        <details className="mt-5 rounded-lg border border-slate-800 bg-ink-950/50 p-3">
          <summary className="cursor-pointer select-none text-sm font-medium text-slate-300">More filters</summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {moreChipKeys.map(({ key, label, optKey, labeledKey }) => (
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
        {err ? <p className="mt-4 text-sm text-red-400">{err}</p> : null}
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
        </>
      ) : null}
    </div>
  )
}
