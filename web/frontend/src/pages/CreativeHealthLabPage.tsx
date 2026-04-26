import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { BackNavLink } from '../components/BackNavLink'
import { CreativeExplainabilitySection } from '../components/CreativeExplainabilitySection'
import { CreativeCopilotSection } from '../components/CreativeCopilotSection'
import { useExplorerBootstrap } from '../hooks/useExplorerBootstrap'
import {
  findAdvertiserBySlug,
  findCampaignBySlug,
  findCreativeBySlug,
} from '../lib/hierarchyResolve'
import { UI_COPY } from '../lib/performanceLabels'
import { pathCreative } from '../lib/routes'
import { explorerUi } from '../lib/explorerUi'

export function CreativeHealthLabPage() {
  const { advertiserSlug, campaignSlug, creativeSlug } = useParams<{
    advertiserSlug: string
    campaignSlug: string
    creativeSlug: string
  }>()

  const { advertisers, error: loadErr } = useExplorerBootstrap()

  const advertiser = useMemo(() => findAdvertiserBySlug(advertisers, advertiserSlug), [advertisers, advertiserSlug])
  const campaign = useMemo(() => findCampaignBySlug(advertiser, campaignSlug), [advertiser, campaignSlug])
  const creative = useMemo(() => findCreativeBySlug(campaign, creativeSlug), [campaign, creativeSlug])

  if (loadErr) {
    return <p className={explorerUi.errorMessage}>{loadErr}</p>
  }

  if (advertisers && advertiser && (!campaign || !creative)) {
    return (
      <div className={explorerUi.notFoundWrap}>
        <BackNavLink to="/">← Home</BackNavLink>
        <p className={explorerUi.notFoundBody}>{UI_COPY.creativeOrCampaignNotFound}</p>
      </div>
    )
  }

  if (!advertiser || !campaign || !creative) {
    return <p className={explorerUi.mutedMessage}>{UI_COPY.loading}</p>
  }

  return (
    <div className={explorerUi.pageWrap}>
      <div className={explorerUi.headerRow}>
        <div>
          <BackNavLink to={pathCreative(advertiser.slug, campaign.slug, creative.slug)}>
            ← Back to Creative #{creative.creative_id}
          </BackNavLink>
          <h1 className={explorerUi.title}>Smadex Survivability Lab</h1>
          <p className={explorerUi.subtitle}>Advanced health and hazard forecasting for creative #{creative.creative_id}</p>
        </div>
      </div>

      <div className="space-y-12">
        {/* Pre-launch section */}
        {creative.health_score != null && creative.shap_json ? (
          <CreativeExplainabilitySection healthScore={creative.health_score} shapJson={creative.shap_json} />
        ) : (
          <div className="rounded-lg border border-dashed border-stone-200 p-8 text-center">
            <p className="text-stone-500 italic">No pre-launch health data available for this creative.</p>
          </div>
        )}

        {/* Post-launch section */}
        {creative?.daily_hazards_json && creative.daily_hazards_json.daily_data && creative.daily_hazards_json.daily_data.length > 0 ? (
          <CreativeCopilotSection dailyHazardsJson={creative.daily_hazards_json} />
        ) : (
          <div className="rounded-lg border border-dashed border-stone-200 p-8 text-center">
            <p className="text-stone-500 italic">No post-launch fatigue forecasting available for this creative.</p>
          </div>
        )}
      </div>
    </div>
  )
}
