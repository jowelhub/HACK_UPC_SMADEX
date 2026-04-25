/**
 * Client routes: single source of truth for URL segments and path builders.
 * Keep in sync with <Route path="…"> in App.tsx (patterns exported as ROUTE_PATTERNS).
 */

export const ROUTE_SEGMENTS = {
  campaign: 'campaign',
  creative: 'creative',
  copilot: 'copilot',
} as const

/** Child route paths under the layout parent (no leading slash). */
export const ROUTE_PATTERNS = {
  copilot: ROUTE_SEGMENTS.copilot,
  creativeNested: `:advertiserSlug/${ROUTE_SEGMENTS.campaign}/:campaignSlug/${ROUTE_SEGMENTS.creative}/:creativeSlug`,
  campaign: `:advertiserSlug/${ROUTE_SEGMENTS.campaign}/:campaignSlug`,
  legacyCreativeById: `:advertiserSlug/${ROUTE_SEGMENTS.creative}/:creativeId`,
  advertiser: ':advertiserSlug',
} as const

function seg(part: string) {
  return part.replace(/^\/+|\/+$/g, '')
}

/** Home / advertiser index */
export function pathHome() {
  return '/'
}

export function pathCopilot() {
  return `/${ROUTE_SEGMENTS.copilot}`
}

export function pathAdvertiser(advertiserSlug: string) {
  return `/${seg(advertiserSlug)}`
}

export function pathCampaign(advertiserSlug: string, campaignSlug: string) {
  return `/${seg(advertiserSlug)}/${ROUTE_SEGMENTS.campaign}/${seg(campaignSlug)}`
}

export function pathCreative(advertiserSlug: string, campaignSlug: string, creativeSlug: string) {
  return `/${seg(advertiserSlug)}/${ROUTE_SEGMENTS.campaign}/${seg(campaignSlug)}/${ROUTE_SEGMENTS.creative}/${seg(creativeSlug)}`
}
