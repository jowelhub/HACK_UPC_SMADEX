/**
 * Client routes: path builders + patterns for <Route path="…">.
 * Campaign and creative live as extra path segments (no reserved words like "campaign").
 */

export const ROUTE_SEGMENTS = {
  copilot: 'copilot',
} as const

/** Child route paths under the layout parent (no leading slash). Declare most specific first in <Routes>. */
export const ROUTE_PATTERNS = {
  copilot: ROUTE_SEGMENTS.copilot,
  /** Creative drill-down: /{advertiser}/{campaign}/{creative} */
  creativeNested: ':advertiserSlug/:campaignSlug/:creativeSlug',
  /** Advertiser + campaign or numeric legacy creative id: /{advertiser}/{campaignOrId} */
  advertiserCampaign: ':advertiserSlug/:campaignSlug',
  advertiser: ':advertiserSlug',
} as const

function seg(part: string) {
  return part.replace(/^\/+|\/+$/g, '')
}

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
  return `/${seg(advertiserSlug)}/${seg(campaignSlug)}`
}

export function pathCreative(advertiserSlug: string, campaignSlug: string, creativeSlug: string) {
  return `/${seg(advertiserSlug)}/${seg(campaignSlug)}/${seg(creativeSlug)}`
}

/** Second path segment is only digits (legacy deep-link by creative id). */
export function isNumericCreativeSegment(segment: string | undefined): boolean {
  return Boolean(segment && /^\d+$/.test(segment))
}
