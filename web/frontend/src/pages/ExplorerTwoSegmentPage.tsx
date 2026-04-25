import { useParams } from 'react-router-dom'
import { CampaignDetailPage } from './CampaignDetailPage'
import { LegacyNumericCreativeRedirect } from './LegacyNumericCreativeRedirect'
import { isNumericCreativeSegment } from '../lib/routes'

/**
 * /{advertiser}/{second}: either a campaign slug or a numeric creative id (legacy redirect).
 */
export function ExplorerTwoSegmentPage() {
  const { campaignSlug } = useParams<{ advertiserSlug: string; campaignSlug: string }>()
  if (isNumericCreativeSegment(campaignSlug)) {
    return <LegacyNumericCreativeRedirect />
  }
  return <CampaignDetailPage />
}
