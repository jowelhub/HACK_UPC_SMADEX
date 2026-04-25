import { apiPaths } from './apiPaths'

export type PerformanceFilters = Record<string, unknown>

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(t || r.statusText)
  }
  return r.json() as Promise<T>
}

export type HierarchyCreative = {
  creative_id: number
  slug: string
  label: string
  asset_file: string | null
  /** From `creative_summary.creative_status` when seeded. */
  creative_status?: string | null
  fatigue_day?: number | null
  perf_score?: number | null
  /** True when `creative_status === 'fatigued'` (dataset label). */
  is_fatigued?: boolean
}
export type HierarchyCampaign = {
  campaign_id: number
  slug: string
  label: string
  creatives: HierarchyCreative[]
  /** From `advertiser_campaign_rankings` (1 = best within advertiser). */
  portfolio_rank?: number | null
  portfolio_composite_score?: number | null
  portfolio_health_score?: number | null
  n_healthy_creatives?: number | null
}
export type HierarchyAdvertiser = {
  advertiser_id: number
  label: string
  slug: string
  vertical?: string | null
  hq_region?: string | null
  campaigns: HierarchyCampaign[]
}

export async function fetchPerformanceHierarchy() {
  const r = await fetch(apiPaths.performanceHierarchy)
  if (!r.ok) throw new Error(await r.text())
  return r.json() as Promise<{ advertisers: HierarchyAdvertiser[] }>
}

export function creativeAssetUrl(creativeId: number) {
  return apiPaths.creativeAsset(creativeId)
}

export async function fetchPerformanceQuery(payload: {
  filters: PerformanceFilters
  timeseries_grain?: string | null
  breakdown?: string | null
  /** Multiple dimensions at once (e.g. country, os, format) from the daily fact table. */
  breakdowns?: string[] | null
  leaderboard?: { by?: string; metric?: string; limit?: number } | null
  include_entity_rankings?: boolean
}) {
  return post<{
    summary: Record<string, number | null>
    row_count: number
    timeseries?: Array<Record<string, unknown>>
    breakdown?: Array<Record<string, unknown>>
    breakdowns?: Record<string, Array<Record<string, unknown>>>
    leaderboard?: Array<Record<string, unknown>>
    entity_rankings?: {
      advertisers: PerformanceEntityRow[]
      campaigns: PerformanceEntityRow[]
      creatives: PerformanceEntityRow[]
    }
  }>(apiPaths.performanceQuery, payload)
}

export type PerformanceQueryResponse = Awaited<ReturnType<typeof fetchPerformanceQuery>>

export type PerformanceEntityRow = {
  label: string
  advertiser_id?: number
  campaign_id?: number
  creative_id?: number
  spend_usd: number
  impressions: number
  clicks: number
  conversions: number
  revenue_usd: number
  ctr: number | null
  cvr: number | null
  cpa_usd: number | null
  roas: number | null
  ipm: number | null
}

export async function fetchFilterOptions(filters: PerformanceFilters) {
  return post<{ options: Record<string, unknown> }>(apiPaths.performanceFilterOptions, { filters })
}
