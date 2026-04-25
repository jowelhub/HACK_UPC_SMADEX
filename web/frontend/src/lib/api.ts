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

export type HierarchyCreative = { creative_id: number; label: string; asset_file: string | null }
export type HierarchyCampaign = { campaign_id: number; label: string; creatives: HierarchyCreative[] }
export type HierarchyAdvertiser = { advertiser_id: number; label: string; campaigns: HierarchyCampaign[] }

/** Drill-down scope for performance filters and breakdowns. */
export type PerformanceScope =
  | { kind: 'all' }
  | { kind: 'advertiser'; advertiserId: number }
  | { kind: 'campaign'; advertiserId: number; campaignId: number }
  | { kind: 'creative'; advertiserId: number; campaignId: number; creativeId: number }

export async function fetchPerformanceHierarchy() {
  const r = await fetch('/api/performance/hierarchy')
  if (!r.ok) throw new Error(await r.text())
  return r.json() as Promise<{ advertisers: HierarchyAdvertiser[] }>
}

export function creativeAssetUrl(creativeId: number) {
  return `/api/creatives/${creativeId}/asset`
}

export async function fetchPerformanceQuery(payload: {
  filters: PerformanceFilters
  timeseries_grain?: string | null
  breakdown?: string | null
  leaderboard?: { by?: string; metric?: string; limit?: number } | null
  include_entity_rankings?: boolean
}) {
  return post<{
    summary: Record<string, number | null>
    row_count: number
    timeseries?: Array<Record<string, unknown>>
    breakdown?: Array<Record<string, unknown>>
    leaderboard?: Array<Record<string, unknown>>
    entity_rankings?: {
      advertisers: PerformanceEntityRow[]
      campaigns: PerformanceEntityRow[]
      creatives: PerformanceEntityRow[]
    }
  }>('/api/performance/query', payload)
}

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
  return post<{ options: Record<string, unknown> }>('/api/performance/filter-options', { filters })
}

export async function fetchFatigueCreativeIds(): Promise<number[]> {
  const r = await fetch('/api/fatigue/creative-ids')
  if (!r.ok) throw new Error(await r.text())
  const j = (await r.json()) as { creative_ids: number[] }
  return j.creative_ids ?? []
}

export type FatigueMLStatus = {
  trained: boolean
  best_params?: Record<string, unknown>
  test_metrics?: { rmse: number; mae: number; r2: number }
  n_features?: number
}

export async function fetchFatigueMLStatus(): Promise<FatigueMLStatus> {
  const r = await fetch('/api/fatigue/ml/status')
  if (!r.ok) throw new Error(await r.text())
  return r.json() as Promise<FatigueMLStatus>
}

export type MLCurvePoint = {
  days_since_launch: number
  actual_ctr: number
  predicted_ctr: number
}

export async function fetchFatigueMLPredictCurve(creativeId: number) {
  const r = await fetch(`/api/fatigue/ml/predict-curve/${creativeId}`)
  if (!r.ok) throw new Error(await r.text())
  return r.json() as Promise<{ creative_id: number; trained: boolean; series: MLCurvePoint[] }>
}

export async function fetchRecommendations(filters: PerformanceFilters) {
  return post<{ items: RecommendationRow[] }>('/api/recommendations/list', { filters })
}

export type RecommendationRow = {
  creative_id: number
  campaign_id: number
  advertiser_name?: string
  app_name?: string
  format?: string
  theme?: string
  creative_status?: string
  health_score: number
  overall_roas: number
  action: string
  reason: string
  confidence: number
  urgency: number
  rotate_to_creative_id?: number | null
}
