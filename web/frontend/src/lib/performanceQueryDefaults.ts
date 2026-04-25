import type { PerformanceFilters } from './api'

/** Default body fields for explorer POST /api/performance/query (daily grain). */
export const performanceDailyQueryBase = {
  timeseries_grain: 'day' as const,
  leaderboard: null,
  include_entity_rankings: false,
}

export type PerformanceBreakdownKey = 'campaign_id' | 'creative_id' | null

export function buildAdvertiserFilters(
  advertiserId: number,
  dates: { from: string; to: string },
): PerformanceFilters {
  return {
    date_from: dates.from,
    date_to: dates.to,
    advertiser_ids: [advertiserId],
  }
}

export function buildCampaignFilters(
  advertiserId: number,
  campaignId: number,
  dates: { from: string; to: string },
): PerformanceFilters {
  return {
    ...buildAdvertiserFilters(advertiserId, dates),
    campaign_ids: [campaignId],
  }
}

export function buildCreativeFilters(
  advertiserId: number,
  creativeId: number,
  dates: { from: string; to: string },
): PerformanceFilters {
  return {
    ...buildAdvertiserFilters(advertiserId, dates),
    creative_ids: [creativeId],
  }
}
