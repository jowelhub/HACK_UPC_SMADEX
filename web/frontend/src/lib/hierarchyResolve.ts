import type { HierarchyAdvertiser, HierarchyCampaign, HierarchyCreative } from './api'

export function normalizeSlugParam(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

export function findAdvertiserBySlug(
  advertisers: HierarchyAdvertiser[] | null | undefined,
  slugParam: string | undefined,
): HierarchyAdvertiser | null {
  const key = normalizeSlugParam(slugParam)
  if (!advertisers?.length || !key) return null
  return advertisers.find((a) => a.slug.toLowerCase() === key) ?? null
}

export function findCampaignBySlug(
  advertiser: HierarchyAdvertiser | null | undefined,
  slugParam: string | undefined,
): HierarchyCampaign | null {
  const key = normalizeSlugParam(slugParam)
  if (!advertiser?.campaigns.length || !key) return null
  return advertiser.campaigns.find((c) => c.slug.toLowerCase() === key) ?? null
}

export function findCreativeBySlug(
  campaign: HierarchyCampaign | null | undefined,
  slugParam: string | undefined,
): HierarchyCreative | null {
  const key = normalizeSlugParam(slugParam)
  if (!campaign?.creatives.length || !key) return null
  return campaign.creatives.find((c) => c.slug.toLowerCase() === key) ?? null
}

export function findCreativeInAdvertiser(
  advertiser: HierarchyAdvertiser,
  creativeId: number,
): { campaign: HierarchyCampaign; creative: HierarchyCreative } | null {
  for (const campaign of advertiser.campaigns) {
    const creative = campaign.creatives.find((c) => c.creative_id === creativeId)
    if (creative) return { campaign, creative }
  }
  return null
}
