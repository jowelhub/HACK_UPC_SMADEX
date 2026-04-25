/** UI copy for performance panels (aligned with API breakdown dimensions). */
export const PERFORMANCE_SECTION = {
  heading: 'Performance',
} as const

export const BREAKDOWN_CHART_TITLE = {
  byCampaign: 'By campaign',
  byCreative: 'By creative',
} as const

export const PAGE_SECTION = {
  campaigns: 'Campaigns',
  creatives: 'Creatives',
  advertisers: 'Advertisers',
} as const

export const CAMPAIGN_PCA_SECTION = {
  heading: 'Creative PCA',
  subline:
    'Principal components on standardized numeric fields from merged creatives (creative id, campaign id, advertiser/app names, launch date, and asset path excluded). Color = creative status.',
} as const

/** Creative detail: multi-dimension explorer from `creative_daily_country_os_stats` (joined frame). */
export const CREATIVE_CROSS_DIM = {
  heading: 'Cross-dimension analysis',
  subline:
    'Aggregates the same filtered daily fact rows by country, OS, and creative format. Country and OS come from delivery rows; format is the creative metadata on each row.',
} as const

export const UI_COPY = {
  loading: 'Loading…',
  redirecting: 'Redirecting…',
  noAdvertiserMatch: 'No advertiser matches this URL.',
  campaignNotFound: 'Campaign not found.',
  creativeOrCampaignNotFound: 'Creative or campaign not found.',
  unknownAdvertiser: 'Unknown advertiser.',
  backToAdvertisers: '← Advertisers',
  noImage: 'No image available',
  advertiserListFallback: 'View performance',
} as const

export function formatMetaLine(...parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter(Boolean)
    .join(' · ')
}
