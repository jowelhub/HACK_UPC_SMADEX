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

export async function fetchPerformanceQuery(payload: {
  filters: PerformanceFilters
  timeseries_grain?: string | null
  breakdown?: string | null
  leaderboard?: { by?: string; metric?: string; limit?: number } | null
}) {
  return post<{
    summary: Record<string, number | null>
    row_count: number
    timeseries?: Array<Record<string, unknown>>
    breakdown?: Array<Record<string, unknown>>
    leaderboard?: Array<Record<string, unknown>>
  }>('/api/performance/query', payload)
}

export async function fetchFilterOptions(filters: PerformanceFilters) {
  return post<{ options: Record<string, unknown> }>('/api/performance/filter-options', { filters })
}

export async function fetchFatigueSummary(filters: PerformanceFilters) {
  return post<{ items: FatigueRow[] }>('/api/fatigue/summary', { filters })
}

export async function fetchFatigueCurve(creativeId: number) {
  const r = await fetch(`/api/fatigue/curve/${creativeId}`)
  if (!r.ok) throw new Error(await r.text())
  return r.json() as Promise<{ creative_id: number; series: FatiguePoint[] }>
}

export async function fetchRecommendations(filters: PerformanceFilters) {
  return post<{ items: RecommendationRow[] }>('/api/recommendations/list', { filters })
}

export type FatigueRow = {
  creative_id: number
  campaign_id: number
  baseline_cpa_usd: number
  current_rolling_cpa_usd: number | null
  degradation: number | null
  degradation_cpa?: number | null
  degradation_ctr?: number | null
  degradation_cvr?: number | null
  health_score: number | null
  is_fatiguing_now: boolean
  last_date: string
  max_days_since_launch: number
  creative_status?: string
  fatigue_day?: number | null
  ctr_decay_pct?: number | null
  cvr_decay_pct?: number | null
}

export type FatiguePoint = {
  date: string
  days_since_launch: number
  rolling_cpa_usd: number | null
  baseline_cpa_usd: number
  degradation: number | null
  degradation_cpa?: number | null
  degradation_ctr?: number | null
  degradation_cvr?: number | null
  health: number | null
  rolling_ctr: number | null
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
