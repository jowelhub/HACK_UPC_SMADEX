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
  /** From merged `creatives.creative_status` when seeded. */
  creative_status?: string | null
  fatigue_day?: number | null
  perf_score?: number | null
  health_score?: number | null
  shap_json?: any
  daily_hazards_json?: any
  /** True when `creative_status === 'fatigued'` (dataset label). */
  is_fatigued?: boolean
}
export type HierarchyCampaign = {
  campaign_id: number
  slug: string
  label: string
  /** Campaign optimization goal from merged campaigns (e.g. CPA, ROAS). */
  kpi_goal?: string | null
  creatives: HierarchyCreative[]
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

export type CampaignCreativePcaPoint = {
  creative_id: number
  pc1: number
  pc2: number
  label: string
  creative_status: string | null
}

export type CampaignCreativePcaResponse = {
  explained_variance_ratio: number[]
  n_features_used?: number
  points: CampaignCreativePcaPoint[]
}

export async function fetchCampaignCreativePca(campaignId: number): Promise<CampaignCreativePcaResponse> {
  const r = await fetch(apiPaths.campaignCreativePca(campaignId))
  if (!r.ok) throw new Error(await r.text())
  return r.json() as Promise<CampaignCreativePcaResponse>
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
